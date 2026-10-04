import test from "node:test";
import assert from "node:assert/strict";
import { EVENTS } from "../src/game/content";
import { advance, createGame, progress } from "../src/game/engine";
import {
  CIV_IDS,
  type CivId,
  type EventId,
  type GameState,
} from "../src/game/types";

/** Play a world of AI towns and record each town's event for every decade. */
function eventLog(seed: number): Record<CivId, EventId[]> {
  let s: GameState = createGame("heartland", "solo", seed, []);
  const log = Object.fromEntries(
    CIV_IDS.map((c) => [c, [] as EventId[]]),
  ) as Record<CivId, EventId[]>;
  for (let guard = 0; s.phase !== "ended" && guard < 200; guard++) {
    if (s.phase === "event") {
      for (const c of CIV_IDS) log[c].push(s.events[c].type);
      s = advance(s);
    } else s = progress(s);
  }
  return log;
}
const chained = (id: EventId) => !!EVENTS[id].chainFrom?.length;

test("the same seed replays the same events (SpacetimeDB stays deterministic)", () => {
  assert.deepEqual(eventLog(1234), eventLog(1234));
});

test("different seeds start different worlds", () => {
  const firsts = new Set(
    [11, 222, 3333, 44444, 555555, 6666666].map((seed) =>
      CIV_IDS.map((c) => eventLog(seed)[c][0]).join(","),
    ),
  );
  assert(firsts.size >= 4, `only ${firsts.size} distinct openings`);
});

test("no town draws the same event two decades running", () => {
  for (let seed = 1; seed <= 50; seed++) {
    const log = eventLog(seed * 7919);
    for (const c of CIV_IDS)
      for (let i = 1; i < log[c].length; i++)
        if (!chained(log[c][i]))
          assert.notEqual(
            log[c][i],
            log[c][i - 1],
            `seed ${seed * 7919}, ${c}, decade ${i + 1}`,
          );
  }
});

test("towns see a good spread of events over a game", () => {
  let distinct = 0,
    towns = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const log = eventLog(seed * 104729);
    for (const c of CIV_IDS) {
      distinct += new Set(log[c]).size;
      towns++;
    }
  }
  assert(
    distinct / towns >= 5,
    `average ${(distinct / towns).toFixed(2)} distinct events per town`,
  );
});
