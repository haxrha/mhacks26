import {
  schema,
  table,
  t,
  SenderError,
  type ReducerCtx,
} from "spacetimedb/server";
import {
  applyAction,
  createGame,
  resolveRound,
  advanceFlows,
  answerQuiz,
  nextRound,
  runBots,
} from "../../apps/web/src/game/engine";
import {
  type Action,
  CIV_IDS,
  type CivId,
  type GameState,
  RESOURCES,
} from "../../apps/web/src/game/types";

const room = table(
  { name: "room", public: true },
  {
    id: t.string().primaryKey(),
    host: t.identity(),
    revision: t.u32(),
    stateJson: t.string(),
  },
);
const seat = table(
  { name: "seat", public: true },
  {
    id: t.string().primaryKey(),
    roomId: t.string().index("btree"),
    identity: t.identity(),
    civ: t.string(),
    ready: t.bool(),
  },
);
const quizClock = table(
  { name: "quiz_clock" },
  {
    id: t.string().primaryKey(),
    startedMicros: t.u64(),
    questionId: t.string(),
  },
);
const database = schema({ room, seat, quizClock });
export default database;
type Ctx = ReducerCtx<typeof database.schemaType>;
const code = (value: string) => {
  if (!/^[A-Z0-9]{6}$/.test(value))
    throw new SenderError("Use a six-character room code.");
  return value;
};
const getRoom = (ctx: Ctx, id: string) => {
  const value = ctx.db.room.id.find(code(id));
  if (!value) throw new SenderError("World not found.");
  return value;
};
const getSeat = (ctx: Ctx, id: string) => {
  const value = [...ctx.db.seat.iter()].find(
    (s) => s.roomId === id && s.identity.isEqual(ctx.sender),
  );
  if (!value) throw new SenderError("Claim a civilization in this room first.");
  return value;
};
function save(ctx: Ctx, row: ReturnType<typeof getRoom>, state: GameState) {
  ctx.db.room.id.update({
    ...row,
    revision: row.revision + 1,
    stateJson: JSON.stringify(state),
  });
}
function validateAction(value: unknown, civ: CivId): Action {
  if (!value || typeof value !== "object")
    throw new SenderError("Invalid action.");
  const a = value as Record<string, unknown>;
  const allowed = [
    "build",
    "convert",
    "repair",
    "research",
    "market",
    "trade",
    "aid",
    "embargo",
    "tariff",
    "shipping",
    "divert",
    "opensource",
    "license",
    "accord",
    "forecast",
  ];
  if (!allowed.includes(String(a.type)) || a.civ !== civ)
    throw new SenderError("You can only act for your civilization.");
  const required: Record<string, string[]> = {
    build: ["tile", "building"],
    convert: ["tile"],
    repair: ["tile"],
    research: ["tech"],
    opensource: ["tech"],
    license: ["target", "tech"],
    market: ["resource", "amount", "buy"],
    trade: ["target", "give", "receive", "amount", "recurring"],
    aid: ["target", "resource", "amount"],
    embargo: ["resource"],
    tariff: ["target"],
    shipping: ["policy"],
    forecast: ["policy"],
  };
  for (const key of required[String(a.type)] ?? [])
    if (!(key in a)) throw new SenderError(`Missing ${key}.`);
  for (const key of ["tile", "building", "tech"])
    if (key in a && (typeof a[key] !== "string" || String(a[key]).length > 80))
      throw new SenderError(`Invalid ${key}.`);
  for (const key of ["buy", "recurring"])
    if (key in a && typeof a[key] !== "boolean")
      throw new SenderError(`Invalid ${key}.`);
  if (
    "amount" in a &&
    (!Number.isInteger(a.amount) ||
      Number(a.amount) < 1 ||
      Number(a.amount) > 30)
  )
    throw new SenderError("Invalid quantity.");
  for (const key of ["give", "receive", "resource"])
    if (key in a && !RESOURCES.includes(a[key] as never))
      throw new SenderError("Unknown resource.");
  if ("target" in a && !CIV_IDS.includes(a.target as CivId))
    throw new SenderError("Unknown partner.");
  if (
    a.type === "shipping" &&
    !["open", "tax", "block"].includes(String(a.policy))
  )
    throw new SenderError("Unknown shipping policy.");
  if (
    a.type === "forecast" &&
    !["shared", "sold", "hidden"].includes(String(a.policy))
  )
    throw new SenderError("Unknown forecast policy.");
  return a as unknown as Action;
}
export const createWorld = database.reducer(
  { roomId: t.string(), civ: t.string(), seed: t.u32(), solo: t.bool() },
  (ctx, args) => {
    const id = code(args.roomId);
    if (ctx.db.room.id.find(id))
      throw new SenderError("Room code already exists. Try another.");
    if (!CIV_IDS.includes(args.civ as CivId))
      throw new SenderError("Unknown civilization.");
    if (
      [...ctx.db.room.iter()].filter((r) => r.host.isEqual(ctx.sender))
        .length >= 20
    )
      throw new SenderError("This identity has reached the 20-world limit.");
    const state = createGame(
      args.civ as CivId,
      args.solo ? "solo" : "hotseat",
      args.seed,
    );
    ctx.db.room.insert({
      id,
      host: ctx.sender,
      revision: 1,
      stateJson: JSON.stringify(state),
    });
    ctx.db.seat.insert({
      id: id + ":" + args.civ,
      roomId: id,
      identity: ctx.sender,
      civ: args.civ,
      ready: false,
    });
  },
);
export const joinWorld = database.reducer(
  { roomId: t.string(), civ: t.string() },
  (ctx, args) => {
    const row = getRoom(ctx, args.roomId),
      state = JSON.parse(row.stateJson) as GameState;
    if (
      state.mode === "solo" ||
      state.round !== 1 ||
      state.phase !== "planning"
    )
      throw new SenderError("This world is not accepting new players.");
    if (!CIV_IDS.includes(args.civ as CivId))
      throw new SenderError("Unknown civilization.");
    if (
      [...ctx.db.seat.iter()].some(
        (s) => s.roomId === row.id && s.identity.isEqual(ctx.sender),
      )
    )
      throw new SenderError("You already have a civilization here.");
    if (ctx.db.seat.id.find(row.id + ":" + args.civ))
      throw new SenderError("That civilization is already claimed.");
    ctx.db.seat.insert({
      id: row.id + ":" + args.civ,
      roomId: row.id,
      identity: ctx.sender,
      civ: args.civ,
      ready: false,
    });
  },
);
export const act = database.reducer(
  { roomId: t.string(), revision: t.u32(), actionJson: t.string() },
  (ctx, args) => {
    const row = getRoom(ctx, args.roomId),
      seat = getSeat(ctx, row.id);
    if (row.revision !== args.revision)
      throw new SenderError("The world changed. Refresh and retry.");
    if (seat.ready) throw new SenderError("Your plan is already locked.");
    if (args.actionJson.length > 3000)
      throw new SenderError("Action is too large.");
    const action = validateAction(
      JSON.parse(args.actionJson),
      seat.civ as CivId,
    );
    const result = applyAction(JSON.parse(row.stateJson), action);
    if (result.error) throw new SenderError(result.error);
    save(ctx, row, result.state);
  },
);
export const ready = database.reducer({ roomId: t.string() }, (ctx, args) => {
  const row = getRoom(ctx, args.roomId),
    seat = getSeat(ctx, row.id);
  let state = JSON.parse(row.stateJson) as GameState;
  if (state.phase !== "planning")
    throw new SenderError("Planning is already complete.");
  ctx.db.seat.id.update({ ...seat, ready: true });
  const seats = [...ctx.db.seat.iter()].filter((s) => s.roomId === row.id);
  if (seats.every((s) => s.ready)) {
    // Claimed civilizations cannot be controlled by bots; unused actions are forfeited.
    for (const claimed of seats) state.civs[claimed.civ as CivId].ap = 0;
    if (state.mode === "hotseat") state = runBots(state);
    state = resolveRound(state);
    save(ctx, row, state);
  }
});
export const advance = database.reducer({ roomId: t.string() }, (ctx, args) => {
  const row = getRoom(ctx, args.roomId);
  getSeat(ctx, row.id);
  if (!row.host.isEqual(ctx.sender))
    throw new SenderError("Only the host advances the shared world.");
  let state = JSON.parse(row.stateJson) as GameState;
  if (state.phase === "flows") {
    state = advanceFlows(state);
    // Unclaimed seats resolve quizzes as bots; each real player answers on their device.
    const claimed = [...ctx.db.seat.iter()]
      .filter((s) => s.roomId === row.id)
      .map((s) => s.civ);
    for (const quiz of state.quizzes.filter(
      (q) => !claimed.includes(q.civ) && !q.tier,
    )) {
      while (!state.quizzes.find((q) => q.civ === quiz.civ)!.tier)
        state = answerQuiz(state, quiz.civ, -1, 15001);
    }
  } else if (state.phase === "debrief") {
    state = nextRound(state);
    for (const s of [...ctx.db.seat.iter()].filter((s) => s.roomId === row.id))
      ctx.db.seat.id.update({ ...s, ready: false });
  } else throw new SenderError("Finish the current phase first.");
  save(ctx, row, state);
});
export const beginQuestion = database.reducer(
  { roomId: t.string(), questionId: t.string() },
  (ctx, args) => {
    const row = getRoom(ctx, args.roomId),
      seat = getSeat(ctx, row.id),
      state = JSON.parse(row.stateJson) as GameState;
    const quiz = state.quizzes.find((q) => q.civ === seat.civ && !q.tier);
    if (
      state.phase !== "quiz" ||
      !quiz ||
      quiz.questions[quiz.answers.length] !== args.questionId
    )
      throw new SenderError("This question is not active.");
    const id = row.id + ":" + seat.civ + ":" + args.questionId;
    if (!ctx.db.quizClock.id.find(id))
      ctx.db.quizClock.insert({
        id,
        startedMicros: ctx.timestamp.microsSinceUnixEpoch,
        questionId: args.questionId,
      });
  },
);
export const answer = database.reducer(
  {
    roomId: t.string(),
    questionId: t.string(),
    option: t.i32(),
    lifeline: t.bool(),
  },
  (ctx, args) => {
    const row = getRoom(ctx, args.roomId),
      seat = getSeat(ctx, row.id),
      state = JSON.parse(row.stateJson) as GameState;
    const quiz = state.quizzes.find((q) => q.civ === seat.civ && !q.tier);
    if (
      state.phase !== "quiz" ||
      !quiz ||
      quiz.questions[quiz.answers.length] !== args.questionId
    )
      throw new SenderError("This question is no longer active.");
    if (args.option < -1 || args.option > 3)
      throw new SenderError("Invalid answer.");
    const clock = ctx.db.quizClock.id.find(
      row.id + ":" + seat.civ + ":" + args.questionId,
    );
    if (!clock) throw new SenderError("Start the question before answering.");
    const ms = Number(
      (ctx.timestamp.microsSinceUnixEpoch - clock.startedMicros) / 1000n,
    );
    const result = answerQuiz(
      state,
      seat.civ as CivId,
      args.option,
      Math.max(0, ms),
      args.lifeline && state.civs[seat.civ as CivId].aided,
    );
    ctx.db.quizClock.id.delete(clock.id);
    save(ctx, row, result);
  },
);
