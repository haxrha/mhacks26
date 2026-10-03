import test from "node:test";
import assert from "node:assert/strict";
import {
  actionError,
  advanceFlows,
  answerQuiz,
  applyAction,
  createGame,
  demoGame,
  hazardProbability,
  marketQuote,
  nextRound,
  propagate,
  resolveRound,
  yields,
} from "../src/game/engine";
import { BUILDINGS, TECHS } from "../src/game/content";
import { QUESTIONS } from "../src/game/questions";
import { CIV_IDS, RESOURCES } from "../src/game/types";

test("seeded resolution is deterministic and leaves input untouched", () => {
  const s = createGame();
  const before = JSON.stringify(s);
  assert.deepEqual(resolveRound(s), resolveRound(s));
  assert.equal(JSON.stringify(s), before);
});
test("demo chains a fault quake into dam failure and downstream flooding", () => {
  const s = demoGame();
  assert(
    s.damages.some((d) => d.type === "earthquake" && d.civ === "heartland"),
  );
  assert(s.flows.some((f) => f.type === "dam_failure" && f.to === "enclave"));
  assert.equal(s.tiles.find((t) => t.id === "t4-0")?.building, undefined);
  assert(s.news.some((n) => n.title.includes("dam failure")));
  assert(
    s.flows.find((f) => f.type === "dam_failure")?.causeId.includes("r1-c"),
  );
});
test("every branch accounts for hazard mass, and cycles terminate", () => {
  const s = demoGame();
  for (const l of s.ledgers)
    assert(
      Math.abs(
        l.incoming - l.impact - l.buffered - l.transmitted - l.dissipated,
      ) < 1e-8,
    );
  assert(s.flows.length < 50);
});
test("a levee reduces local impact while increasing downstream exposure", () => {
  const a = createGame("heartland", "hotseat");
  const b = applyAction(a, {
    type: "build",
    civ: "heartland",
    tile: "t3-3",
    building: "levee",
  }).state;
  const hazard = {
    id: "h",
    type: "flood" as const,
    source: "heartland" as const,
    amount: 24,
    causeId: "test",
  };
  propagate(a, [hazard]);
  propagate(b, [hazard]);
  assert(
    b.damages.find((d) => d.civ === "heartland")!.severity <
      a.damages.find((d) => d.civ === "heartland")!.severity,
  );
  assert(
    b.damages.find((d) => d.civ === "enclave")!.severity >
      a.damages.find((d) => d.civ === "enclave")!.severity,
  );
});
test("oil follows currents and damages island fisheries and ocean health", () => {
  const s = createGame();
  const ocean = s.ocean;
  propagate(s, [
    {
      id: "spill",
      type: "spill",
      source: "petrostate",
      amount: 24,
      causeId: "rig",
    },
  ]);
  assert(
    s.flows.some((f) => f.to === "archipelago" && f.carrier === "current"),
  );
  assert(s.damages.some((d) => d.civ === "archipelago" && d.losses.food! > 0));
  assert(s.ocean < ocean);
});
test("geological hazard probabilities are independent of warming", () => {
  const s = createGame();
  const quake = hazardProbability(s, "earthquake", "archipelago"),
    hurricane = hazardProbability(s, "hurricane", "archipelago");
  s.climate = 2.5;
  assert.equal(hazardProbability(s, "earthquake", "archipelago"), quake);
  assert(hazardProbability(s, "hurricane", "archipelago") > hurricane);
});
test("invalid actions never spend points or mutate stock", () => {
  const s = createGame();
  const bad = applyAction(s, {
    type: "market",
    civ: "heartland",
    resource: "food",
    amount: -10,
    buy: true,
  });
  assert(bad.error);
  assert.equal(bad.state, s);
  assert(
    actionError(s, {
      type: "build",
      civ: "enclave",
      tile: "t4-0",
      building: "dam",
    }),
  );
  assert(
    actionError(s, {
      type: "build",
      civ: "petrostate",
      tile: "t0-0",
      building: "solar",
    }),
  );
});
test("three actions are enforced; research unlocks legal construction", () => {
  let s = createGame("petrostate", "hotseat");
  s.civs.petrostate.resources.innovation = 100;
  for (const tech of ["solar", "storage", "carbon"])
    s = applyAction(s, { type: "research", civ: "petrostate", tech }).state;
  assert.equal(s.civs.petrostate.ap, 0);
  assert(
    actionError(s, {
      type: "build",
      civ: "petrostate",
      tile: "t0-0",
      building: "solar",
    }),
  );
  s.civs.petrostate.ap = 1;
  assert.equal(
    actionError(s, {
      type: "build",
      civ: "petrostate",
      tile: "t0-0",
      building: "solar",
    }),
    null,
  );
});
test("market orders consume actual inventory and move price immediately", () => {
  const s = createGame("enclave", "hotseat");
  const price = s.prices.food,
    stock = s.marketStock.food,
    credits = s.civs.enclave.resources.money;
  const result = applyAction(s, {
    type: "market",
    civ: "enclave",
    resource: "food",
    amount: 5,
    buy: true,
  }).state;
  assert.equal(result.marketStock.food, stock - 5);
  assert(result.prices.food > price);
  assert(result.civs.enclave.resources.money < credits);
  result.marketStock.food = 0;
  assert(
    actionError(result, {
      type: "market",
      civ: "enclave",
      resource: "food",
      amount: 1,
      buy: true,
    }),
  );
});
test("shipping blockade prevents fossil exports and bilateral trade", () => {
  const s = applyAction(createGame("archipelago", "hotseat"), {
    type: "shipping",
    civ: "archipelago",
    policy: "block",
  }).state;
  assert(
    actionError(s, {
      type: "market",
      civ: "petrostate",
      resource: "energy",
      amount: 5,
      buy: false,
    }),
  );
  assert(
    actionError(s, {
      type: "trade",
      civ: "petrostate",
      target: "heartland",
      give: "energy",
      receive: "food",
      amount: 2,
      recurring: false,
    }),
  );
});
test("recurring deals honor stock conservation; embargo breaks an agreement", () => {
  let s = createGame("heartland", "hotseat");
  s = applyAction(s, {
    type: "trade",
    civ: "heartland",
    target: "petrostate",
    give: "food",
    receive: "energy",
    amount: 2,
    recurring: true,
  }).state;
  const totalFood = CIV_IDS.reduce((n, id) => n + s.civs[id].resources.food, 0);
  s = resolveRound(s, []);
  assert.equal(
    CIV_IDS.reduce((n, id) => n + s.civs[id].resources.food, 0),
    totalFood,
  );
  assert.equal(s.deals[0].remaining, 1);
  s.phase = "planning";
  s.civs.petrostate.embargo = "energy";
  const trust = s.trust;
  s = resolveRound(s, []);
  assert.equal(s.deals.length, 0);
  assert(s.trust < trust);
});
test("quiz rapid recovery is capped and cannot alter geographic flows", () => {
  let s = advanceFlows(demoGame());
  const civ = s.quizzes[0].civ;
  const initial = structuredClone(s),
    flowJSON = JSON.stringify(s.flows),
    loss = s.damages
      .filter((d) => d.civ === civ)
      .reduce((n, d) => n + (d.losses.food ?? 0), 0);
  const qs = [...s.quizzes[0].questions];
  for (const id of qs)
    s = answerQuiz(s, civ, QUESTIONS.find((q) => q.id === id)!.correct, 2000);
  assert.equal(s.quizzes[0].tier, "rapid");
  assert.equal(JSON.stringify(s.flows), flowJSON);
  assert(
    Math.abs(
      s.civs[civ].resources.food -
        initial.civs[civ].resources.food -
        loss * 0.25,
    ) < 0.03,
  );
  for (const t of s.tiles) {
    const old = initial.tiles.find((x) => x.id === t.id)!;
    assert(old.disruption - t.disruption <= 2);
  }
});
test("timed-out answers do not gain correct credit; repeated submissions cannot double recovery", () => {
  let s = advanceFlows(demoGame());
  const civ = s.quizzes[0].civ;
  for (const id of [...s.quizzes[0].questions])
    s = answerQuiz(s, civ, QUESTIONS.find((q) => q.id === id)!.correct, 15001);
  assert.equal(s.quizzes[0].tier, "slow");
  assert.deepEqual(answerQuiz(s, civ, 0, 100), s);
});
test("disrupted production is lost for exactly the promised next income steps", () => {
  let s = createGame("heartland", "hotseat");
  const tile = s.tiles.find((t) => t.terrain === "farmland")!;
  tile.disruption = 1;
  assert.equal(yields(s, tile).food, 0);
  s.phase = "debrief";
  s = nextRound(s);
  assert.equal(s.tiles.find((t) => t.id === tile.id)!.disruption, 0);
  assert(
    yields(
      s,
      s.tiles.find((t) => t.id === tile.id)!,
    ).food > 0,
  );
});
test("all content references and 70 unique questions are valid", () => {
  assert.equal(QUESTIONS.length, 70);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 70);
  for (const q of QUESTIONS) {
    assert.equal(q.options.length, 4);
    assert(q.correct >= 0 && q.correct < 4);
    assert(q.source.startsWith("https://"));
  }
  for (const b of Object.values(BUILDINGS)) if (b.tech) assert(TECHS[b.tech]);
});
test("collective collapse overrides prosperity; compliant accord wins after three rounds", () => {
  let s = createGame("heartland", "hotseat");
  s.phase = "debrief";
  s.climate = 3;
  s = nextRound(s);
  assert.equal(s.outcome, "collapse");
  s = createGame("heartland", "hotseat");
  for (const id of CIV_IDS) {
    s.civs[id].accord = true;
    s.civs[id].emissions = 0;
  }
  s.accordStreak = 2;
  s.phase = "debrief";
  s = nextRound(s);
  assert.equal(s.outcome, "concordat");
});
test("market spreads reward trust", () => {
  const s = createGame();
  const bad = marketQuote(s, "heartland", "energy", 5, true);
  s.trust = 100;
  assert(marketQuote(s, "heartland", "energy", 5, true) < bad);
});
test("full ten-round games remain finite and bounded across seeds and classes", () => {
  for (let seed = 0; seed < 20; seed++)
    for (const player of CIV_IDS) {
      let s = createGame(player, "solo", seed);
      let steps = 0;
      while (s.phase !== "ended" && steps++ < 12) {
        s = advanceFlows(resolveRound(s));
        while (s.phase === "quiz") {
          const q = s.quizzes.find((q) => !q.tier)!;
          const item = QUESTIONS.find(
            (item) => item.id === q.questions[q.answers.length],
          )!;
          s = answerQuiz(s, q.civ, item.correct, 5000);
        }
        s = nextRound(s);
        for (const id of CIV_IDS)
          for (const r of RESOURCES)
            assert(
              Number.isFinite(s.civs[id].resources[r]) &&
                s.civs[id].resources[r] >= 0,
            );
        assert(s.climate >= 0 && s.ocean >= 0 && s.ocean <= 100);
      }
      assert.equal(s.phase, "ended");
    }
});
