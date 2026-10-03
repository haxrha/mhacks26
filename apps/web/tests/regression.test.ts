import test from "node:test";
import assert from "node:assert/strict";
import {
  actionError,
  advanceFlows,
  applyAction,
  createGame,
  nextRound,
  resolveRound,
} from "../src/game/engine";

test("solo neighbors resolve their own quizzes without asking the player", () => {
  const s = resolveRound(createGame("heartland", "solo"), [
    { type: "heatwave", source: "enclave", amount: 20 },
  ]);
  const next = advanceFlows(s);
  assert(next.quizzes.every((q) => q.civ === next.player || q.tier));
  assert.equal(next.phase, "debrief");
});
test("open-source research cannot be repeatedly farmed for trust", () => {
  let s = createGame("enclave", "hotseat");
  s = applyAction(s, { type: "research", civ: "enclave", tech: "water" }).state;
  s = applyAction(s, {
    type: "opensource",
    civ: "enclave",
    tech: "water",
  }).state;
  assert(actionError(s, { type: "opensource", civ: "enclave", tech: "water" }));
});
test("greedy extraction and buffer clearing make collective collapse reachable", () => {
  let s = createGame("heartland", "hotseat");
  s = applyAction(s, {
    type: "build",
    civ: "petrostate",
    tile: "t0-3",
    building: "rig",
  }).state;
  for (const tile of s.tiles.filter(
    (t) => t.owner === "archipelago" && t.terrain === "mangrove",
  )) {
    s = applyAction(s, {
      type: "convert",
      civ: "archipelago",
      tile: tile.id,
    }).state;
  }
  for (let i = 0; i < 10 && s.phase !== "ended"; i++) {
    s.civs.heartland.resources.money = 200;
    s.civs.heartland.resources.materials = 200;
    for (const t of s.tiles
      .filter(
        (t) =>
          t.owner === "heartland" && ["forest", "wetland"].includes(t.terrain),
      )
      .slice(0, 3))
      s = applyAction(s, {
        type: "convert",
        civ: "heartland",
        tile: t.id,
      }).state;
    s = advanceFlows(resolveRound(s, []));
    s = nextRound(s);
  }
  assert.equal(s.outcome, "collapse");
});
