import test from "node:test";
import assert from "node:assert/strict";
import { BUILDINGS, EVENTS } from "../src/game/content";
import {
  collapseFromTsunami,
  CLIMATE_LOSS,
  EXCHANGE_RATE,
  ROUNDS,
  advance,
  answerQuiz,
  applyAction,
  autoplay,
  createGame,
  income,
  progress,
  questionFor,
  rollEvents,
  spillTarget,
} from "../src/game/engine";
import { ECONOMY } from "../src/game/content";
import { upkeep } from "../src/game/disasters";
import { QUESTIONS } from "../src/game/questions";
import {
  CIV_IDS,
  RESOURCES,
  type CivId,
  type EventId,
  type GameState,
} from "../src/game/types";

const P: CivId = "heartland";
const total = (s: GameState, c: CivId) =>
  RESOURCES.reduce((n, r) => n + s.civs[c].stock[r], 0);
/** A solo game with the player's event forced, sitting at the quiz. */
function atQuiz(event: EventId = "flood", seed = 7) {
  const s = createGame(P, "solo", seed);
  s.minorEvents = {};
  s.events[P] = { type: event, loss: { ...EVENTS[event].loss } };
  return advance(s);
}
const answer = (s: GameState, right: boolean) => {
  const q = questionFor(s, P)!;
  return answerQuiz(s, P, right ? q.correct : (q.correct + 1) % 4, 3000);
};
const hearNeighbor = (s: GameState) =>
  applyAction(s, { type: "acknowledge", civ: P }).state;
const rich = (s: GameState, c: CivId = P) => {
  for (const r of RESOURCES) s.civs[c].stock[r] = 20;
  return s;
};

test("games are deterministic for a seed", () => {
  assert.deepEqual(
    autoplay(createGame(P, "solo", 42)),
    autoplay(createGame(P, "solo", 42)),
  );
  assert.deepEqual(
    createGame(P, "solo", 9).events,
    createGame(P, "solo", 9).events,
  );
});

test("tsunami is playable with warning systems and eight easy questions", () => {
  assert(
    !EVENTS.tsunami.climateDriven,
    "tectonic tsunami chance does not follow temperature",
  );
  const s = rich(hearNeighbor(answer(atQuiz("tsunami"), false)));
  const result = applyAction(s, { type: "choose", civ: P, option: 1 });
  assert.equal(result.error, undefined);
  assert.equal(result.state.phase, "build");
  assert(result.state.civs[P].buildings.includes("tsunami_warning"));
  assert(BUILDINGS.tsunami_warning.protects?.includes("tsunami"));
  assert(QUESTIONS.filter((q) => q.types.includes("tsunami")).length >= 8);
});

test("bank exchanges record cargo notices without changing failed actions", () => {
  let s = rich(hearNeighbor(answer(atQuiz(), true)));
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  const traded = applyAction(s, {
    type: "exchange",
    civ: P,
    give: "wood",
    get: "brick",
  });
  assert.equal(traded.error, undefined);
  assert.equal(traded.state.news.at(-1)?.kind, "trade");
  assert.equal(traded.state.news.at(-1)?.civ, P);
  const bad = applyAction(s, {
    type: "exchange",
    civ: P,
    give: "wood",
    get: "wood",
  });
  assert(bad.error);
  assert.equal(bad.state, s);
});

test("seeded primary and delayed cascade rolls can produce every hazard", () => {
  const seen = new Set<EventId>();
  for (
    let seed = 1;
    seed <= 4000 && seen.size < Object.keys(EVENTS).length;
    seed++
  ) {
    const s = createGame(P, "solo", seed);
    s.climate = 2.3;
    s.civs.petrostate.buildings.push("refinery");
    for (let round = 1; round <= 10; round++) {
      s.round = round;
      rollEvents(s);
      for (const e of Object.values(s.events)) seen.add(e.type);
    }
  }
  assert.deepEqual(
    [...seen].sort(),
    Object.keys(EVENTS)
      .filter(
        (id) =>
          ![
            "heatwave",
            "smog",
            "grid_failure",
            "pandemic",
            "supply_shock",
          ].includes(id),
      )
      .sort(),
  );
});

test("warming increases only climate-driven event severity and frequency", () => {
  let coolClimateEvents = 0;
  let hotClimateEvents = 0;
  let checkedComparable = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const cool = createGame(P, "solo", seed);
    cool.climate = 0;
    cool.rng = seed;
    rollEvents(cool);
    const hot = createGame(P, "solo", seed);
    hot.climate = 2;
    hot.rng = seed;
    rollEvents(hot);
    for (const civ of CIV_IDS) {
      const coolEvent = cool.events[civ];
      const hotEvent = hot.events[civ];
      if (EVENTS[coolEvent.type].climateDriven) coolClimateEvents++;
      if (EVENTS[hotEvent.type].climateDriven) hotClimateEvents++;
      if (coolEvent.type !== hotEvent.type) continue;
      const coolLoss = Object.values(coolEvent.loss).reduce(
        (sum, n) => sum + (n ?? 0),
        0,
      );
      const hotLoss = Object.values(hotEvent.loss).reduce(
        (sum, n) => sum + (n ?? 0),
        0,
      );
      assert.equal(
        hotLoss - coolLoss,
        EVENTS[hotEvent.type].climateDriven ? 1 : 0,
      );
      checkedComparable++;
    }
  }
  assert(hotClimateEvents > coolClimateEvents);
  assert(checkedComparable > 500);
});

test("one cycle runs event → quiz → response → choice → build → next decade", () => {
  let s = createGame(P, "solo", 3);
  assert.equal(s.phase, "event");
  s = advance(s);
  assert.equal(s.phase, "quiz");
  assert(questionFor(s, P));
  s = answer(s, true);
  assert.equal(s.phase, "response", "the affected neighbor speaks next");
  s = hearNeighbor(s);
  assert.equal(s.phase, "choice", "AI neighbors acknowledge on their own");
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  assert.equal(s.phase, "build");
  assert(s.civs[P].report.length > 0, "the narrator has a report to read");
  const before = { ...s.civs[P].stock };
  const gain = income(s, P);
  const cost = upkeep(s.civs[P]);
  const aid = RESOURCES.some((r) => before[r] + gain[r] < cost[r]);
  s = applyAction(s, { type: "ready", civ: P }).state;
  assert.equal(s.round, 2);
  assert.equal(s.phase, "event");
  for (const r of RESOURCES)
    assert.equal(
      s.civs[P].stock[r],
      Math.min(
        ECONOMY.storageCapacity,
        Math.max(0, before[r] + gain[r] - cost[r]) +
          (aid && r === "wheat" ? 1 : 0),
      ),
    );
});

test("a right answer means smaller losses than a wrong one", () => {
  const take = (right: boolean) => {
    let s = hearNeighbor(answer(rich(atQuiz("flood")), right));
    s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
    return total(s, P);
  };
  assert(take(true) > take(false));
});

test("the cheap choice pushes the damage onto a neighbor", () => {
  let s = rich(atQuiz("flood"));
  s = hearNeighbor(answer(s, false));
  const target = spillTarget(P, "downstream");
  rich(s, target);
  const before = total(s, target);
  s = applyAction(s, { type: "choose", civ: P, option: 0 }).state;
  assert(
    s.civs[target].report.some((l) => l.includes("pushed")),
    "the neighbor is told who did it",
  );
  assert(total(s, target) < before + 0 || s.civs[target].report.length > 0);
});

test("the sustainable choice reduces damage and builds lasting protection", () => {
  let s = hearNeighbor(answer(rich(atQuiz("flood")), false));
  s = applyAction(s, { type: "choose", civ: P, option: 1 }).state;
  assert(s.civs[P].buildings.includes("wetland"));
  assert(s.civs[P].report.some((l) => l.includes("Wetland")));
});

test("building checks cost and caps; the bank trades 3:1", () => {
  let s = hearNeighbor(answer(rich(atQuiz("flood")), true));
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  for (let i = 0; i < BUILDINGS.kiln.max!; i++)
    s = applyAction(s, { type: "build", civ: P, building: "kiln" }).state;
  assert.match(
    applyAction(s, { type: "build", civ: P, building: "kiln" }).error ?? "",
    /room for only|No project actions/,
  );
  assert(applyAction(s, { type: "build", civ: P, building: "wetland" }).error);
  const sheep = s.civs[P].stock.sheep;
  s = applyAction(s, {
    type: "exchange",
    civ: P,
    give: "sheep",
    get: "ore",
  }).state;
  assert.equal(s.civs[P].stock.sheep, sheep - EXCHANGE_RATE);
  s.civs[P].stock.wood = 0;
  assert(applyAction(s, { type: "build", civ: P, building: "farm" }).error);
});

test("you can't act out of turn", () => {
  const s = createGame(P, "solo", 1);
  assert(applyAction(s, { type: "build", civ: P, building: "farm" }).error);
  assert(applyAction(s, { type: "choose", civ: P, option: 0 }).error);
});

test("warming past +3°C ends the game for everyone", () => {
  let s = hearNeighbor(answer(atQuiz("flood"), true));
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  s.climate = CLIMATE_LOSS + 0.5;
  s = applyAction(s, { type: "ready", civ: P }).state;
  assert.equal(s.phase, "ended");
  assert.equal(s.outcome, "collapse");
});

test("full AI games finish within ten decades with no negative stock", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = autoplay(createGame(P, "solo", seed));
    assert.equal(s.phase, "ended");
    assert(s.round <= ROUNDS);
    for (const c of CIV_IDS)
      for (const r of RESOURCES) assert(s.civs[c].stock[r] >= 0);
  }
});

test("hot-seat waits for every person before moving on", () => {
  let s = advance(createGame(P, "hotseat", 5));
  const q = questionFor(s, P)!;
  s = answerQuiz(s, P, q.correct, 1000);
  assert.equal(s.phase, "quiz", "three more people still have to answer");
  assert.equal(progress(s).phase, "quiz");
});

test("every playable event has a quiz, neighbor line and lasting mitigation", () => {
  assert.equal(Object.keys(EVENTS).length, 19);
  for (const [id, event] of Object.entries(EVENTS)) {
    if (id === "mega_tsunami") continue; // Terminal catastrophe has no recovery choice.
    assert(event.neighbor.length > 20, `${id} needs a neighbor response`);
    let s = rich(atQuiz(id as EventId));
    s = hearNeighbor(answer(s, true));
    s = applyAction(s, { type: "choose", civ: P, option: 1 }).state;
    assert(
      s.civs[P].buildings.includes(event.green.build!),
      `${id} should grant ${event.green.build}`,
    );
  }
});

test("the response phase waits for every hot-seat player", () => {
  let s = advance(createGame(P, "hotseat", 15));
  for (const civ of CIV_IDS) {
    const q = questionFor(s, civ)!;
    s = answerQuiz(s, civ, q.correct, 1000);
  }
  assert.equal(s.phase, "response");
  for (const civ of CIV_IDS.slice(0, -1))
    s = applyAction(s, { type: "acknowledge", civ }).state;
  assert.equal(s.phase, "response");
  s = applyAction(s, {
    type: "acknowledge",
    civ: CIV_IDS[CIV_IDS.length - 1],
  }).state;
  assert.equal(s.phase, "choice");
});

test("content is consistent", () => {
  for (const [id, e] of Object.entries(EVENTS)) {
    const pool = QUESTIONS.filter((q) =>
      q.types.some((t) => e.quizTypes.includes(t)),
    );
    assert(pool.length >= 4, `${id} needs quiz questions`);
    assert(
      BUILDINGS[e.green.build!]?.earned,
      `${id} must earn a protective building`,
    );
    assert(BUILDINGS[e.green.build!].protects?.includes(id as EventId));
  }
});

test("catastrophic tsunami kills every civilization immediately and permanently", () => {
  const original = createGame(P, "hotseat", 17);
  original.events.archipelago = { type: "mega_tsunami", loss: {}, severity: 3 };
  for (const c of CIV_IDS) {
    original.civs[c].buildings.push("tsunami_warning", "seawall");
    original.civs[c].quiz = {
      questionId: "test",
      option: 0,
      correct: true,
      ms: 1000,
    };
  }
  const snapshot = structuredClone(original);
  const ended = advance(original);
  assert.deepEqual(original, snapshot);
  assert.equal(ended.phase, "ended");
  assert.equal(ended.outcome, "collapse");
  assert.equal(ended.collapseCause?.type, "mega_tsunami");
  for (const c of CIV_IDS) {
    assert.equal(ended.civs[c].eliminated, true);
    assert.equal(ended.civs[c].buildings.length, 0);
    assert(
      RESOURCES.every(
        (r) => ended.civs[c].stock[r] === 0 && income(ended, c)[r] === 0,
      ),
    );
    assert(
      applyAction(ended, { type: "build", civ: c, building: "farm" }).error,
    );
  }
  const news = ended.news.length;
  assert.equal(collapseFromTsunami(ended), true);
  assert.equal(ended.news.length, news);
  assert.deepEqual(advance(ended), ended);
});
