import test from "node:test";
import assert from "node:assert/strict";
import { BUILDINGS, EVENTS } from "../src/game/content";
import {
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
  spillTarget,
} from "../src/game/engine";
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
  s.events[P] = { type: event, loss: { ...EVENTS[event].loss } };
  return advance(s);
}
const answer = (s: GameState, right: boolean) => {
  const q = questionFor(s, P)!;
  return answerQuiz(s, P, right ? q.correct : (q.correct + 1) % 4, 3000);
};
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

test("one cycle runs event → quiz → choice → build → next decade", () => {
  let s = createGame(P, "solo", 3);
  assert.equal(s.phase, "event");
  s = advance(s);
  assert.equal(s.phase, "quiz");
  assert(questionFor(s, P));
  s = answer(s, true);
  assert.equal(s.phase, "choice", "AI neighbors answer on their own");
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  assert.equal(s.phase, "build");
  assert(s.civs[P].report.length > 0, "the narrator has a report to read");
  const before = { ...s.civs[P].stock };
  const gain = income(s, P);
  s = applyAction(s, { type: "ready", civ: P }).state;
  assert.equal(s.round, 2);
  assert.equal(s.phase, "event");
  for (const r of RESOURCES)
    assert.equal(s.civs[P].stock[r], before[r] + gain[r]);
});

test("a right answer means smaller losses than a wrong one", () => {
  const take = (right: boolean) => {
    let s = answer(rich(atQuiz("flood")), right);
    s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
    return total(s, P);
  };
  assert(take(true) > take(false));
});

test("the cheap choice pushes the damage onto a neighbor", () => {
  let s = rich(atQuiz("flood"));
  s = answer(s, false);
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

test("the sustainable choice halves damage and builds lasting protection", () => {
  let s = answer(rich(atQuiz("flood")), false);
  s = applyAction(s, { type: "choose", civ: P, option: 1 }).state;
  assert(s.civs[P].buildings.includes("wetland"));
  assert(s.civs[P].report.some((l) => l.includes("Wetland")));
});

test("building checks cost and caps; the bank trades 3:1", () => {
  let s = answer(rich(atQuiz("flood")), true);
  s = applyAction(s, { type: "choose", civ: P, option: 2 }).state;
  for (let i = 0; i < BUILDINGS.kiln.max!; i++)
    s = applyAction(s, { type: "build", civ: P, building: "kiln" }).state;
  assert.match(
    applyAction(s, { type: "build", civ: P, building: "kiln" }).error ?? "",
    /room for only/,
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
  let s = answer(atQuiz("flood"), true);
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
