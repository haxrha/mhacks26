import test from "node:test";
import assert from "node:assert/strict";
import {
  advance,
  applyAction,
  createGame,
  questionFor,
  answerQuiz,
} from "../src/game/engine";
import { TOWNS, townIndex } from "../src/game/towns";
import {
  MAP_H,
  MAP_W,
  renderWorld,
  worldLayers,
  renderWorldView,
  seaPixel,
  portRoute,
  tradeTraffic,
  tsunamiDirection,
  wildfireMask,
} from "../src/game/worldRender";
import type { CivId, EventId, GameState } from "../src/game/types";

const render = (state: GameState | undefined, frame = 0) => {
  const out = new Uint8ClampedArray(MAP_W * MAP_H * 4);
  renderWorld(state, frame, out);
  return out;
};
const changed = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  const px: number[] = [];
  for (let i = 0; i < a.length; i += 4)
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
      px.push(i / 4);
  return px;
};
/** Everyone braces, so the map shows each town's own event during the build phase. */
function withEvent(civ: CivId, type: EventId) {
  let s = createGame("heartland", "solo", 11);
  for (const c of Object.keys(s.events) as CivId[])
    s.events[c] = { type: "heatwave", loss: {} };
  s.events[civ] = { type, loss: {} };
  s = advance(s);
  const q = questionFor(s, "heartland")!;
  s = answerQuiz(s, "heartland", q.correct, 1000);
  return applyAction(s, { type: "choose", civ: "heartland", option: 2 }).state;
}

test("world layers decode to a full 320x200 map with one town per civilization", () => {
  const L = worldLayers();
  for (const layer of [L.base, L.kind, L.area, L.near])
    assert.equal(layer.length, MAP_W * MAP_H);
  assert.equal(TOWNS.length, 4);
});

test("extended ocean animates and exactly matches map sea pixels", () => {
  const view = {
    width: 400,
    height: 250,
    originX: 40,
    originY: 10,
    clip: { left: 0, top: 0, right: 400, bottom: 250 },
  };
  const a = new Uint8ClampedArray(400 * 250 * 4),
    b = new Uint8ClampedArray(a.length);
  renderWorldView(undefined, 0, a, view);
  renderWorldView(undefined, 48, b, view);
  assert(
    changed(a, b).some((i) => i % 400 < 40),
    "outer sea must animate",
  );
  const offset = (10 * 400 + 40) * 4;
  assert.deepEqual([...a.slice(offset, offset + 3)], seaPixel(0, 0, 0));
  const outside = (5 * 400 + 5) * 4;
  assert.deepEqual([...a.slice(outside, outside + 3)], seaPixel(-35, -5, 0));
});

test("tsunami crosses the extended sea without covering inland hills", () => {
  const s = createGame("archipelago", "solo", 11);
  for (const c of Object.keys(s.events) as CivId[])
    s.events[c] = { type: "heatwave", loss: {} };
  s.events.archipelago = { type: "tsunami", loss: { brick: 2 } };
  assert.equal(tsunamiDirection(s), tsunamiDirection(structuredClone(s)));
  const view = {
    width: 500,
    height: 300,
    originX: 90,
    originY: 40,
    clip: { left: 0, top: 0, right: 500, bottom: 300 },
  };
  const a = new Uint8ClampedArray(500 * 300 * 4),
    b = new Uint8ClampedArray(a.length);
  renderWorldView(s, 20, a, view);
  const calm = structuredClone(s);
  calm.events.archipelago.type = "heatwave";
  renderWorldView(calm, 20, b, view);
  const diff = changed(a, b);
  assert(
    diff.some(
      (i) =>
        i % 500 < 90 ||
        i % 500 >= 410 ||
        Math.floor(i / 500) < 40 ||
        Math.floor(i / 500) >= 240,
    ),
    "wave must appear beyond the original map rectangle",
  );
  const L = worldLayers();
  for (const i of diff) {
    const x = (i % 500) - 90,
      y = Math.floor(i / 500) - 40;
    if (x >= 0 && x < MAP_W && y >= 0 && y < MAP_H)
      assert(
        ![8, 9].includes(L.kind[y * MAP_W + x]),
        "mountains and snow stay dry",
      );
  }
});

test("trade traffic requires a real exchange and every sailing route stays on water", () => {
  const s = createGame();
  assert.equal(tradeTraffic(s, 0).length, 0);
  s.news.push({
    kind: "trade",
    round: s.round,
    civ: "enclave",
    text: "Cargo dispatched",
  });
  assert.equal(tradeTraffic(s, 0)[0].civ, "enclave");
  s.round++;
  assert.equal(tradeTraffic(s, 0).length, 0);
  const L = worldLayers();
  for (const civ of Object.keys(s.civs) as CivId[]) {
    const path = portRoute(civ);
    assert(path.length > 3);
    for (const [x, y] of path)
      assert(L.kind[y * MAP_W + x] <= 3, "ships must stay on water");
    for (let i = 1; i < path.length; i++)
      assert.equal(
        Math.abs(path[i][0] - path[i - 1][0]) +
          Math.abs(path[i][1] - path[i - 1][1]),
        1,
      );
  }
});

test("rendering is deterministic for the same state and frame", () => {
  const s = createGame();
  assert.deepEqual(render(s, 3), render(s, 3));
});

test("water shimmer holds its frame rather than flashing at the render rate", () => {
  for (let y = -10; y < 15; y++)
    for (let x = -10; x < 15; x++)
      assert.deepEqual(seaPixel(x, y, 0), seaPixel(x, y, 11));
});

test("wildfire leaves forest gaps, crosses borders and stops at natural barriers", () => {
  const s = createGame("enclave", "solo", 11);
  for (const c of Object.keys(s.events) as CivId[])
    s.events[c] = { type: "heatwave", loss: {} };
  s.events.enclave = { type: "wildfire", loss: {} };
  const mask = wildfireMask(s),
    L = worldLayers(),
    owner = townIndex("enclave");
  let burnt = 0,
    untouched = 0,
    crossed = 0;
  for (let i = 0; i < mask.length; i++) {
    if (L.area[i] === owner && L.kind[i] === 5) {
      if (mask[i] > 0) burnt++;
      else untouched++;
    }
    if (mask[i] > 0 && L.area[i] !== owner) crossed++;
    if ([0, 1, 2, 3, 4, 8, 9].includes(L.kind[i])) assert.equal(mask[i], 0);
  }
  assert(burnt > 50, "fire remains visible");
  assert(untouched > burnt, "most forest must remain green");
  assert(crossed > 0, "political borders do not stop the fire mask");
  assert(
    mask.some((v) => v > 0 && v < 0.15),
    "fire edges taper rather than ending solidly",
  );
  assert.deepEqual(mask, wildfireMask(structuredClone(s)));
});

test("a flood only recolours the region it hits", () => {
  const civ: CivId = "enclave";
  const calm = withEvent(civ, "heatwave");
  const flooded = withEvent(civ, "flood");
  const area = townIndex(civ);
  const L = worldLayers();
  const diff = changed(render(calm), render(flooded));
  assert(diff.length > 50, "flood should be visible on the map");
  for (const i of diff)
    assert(
      L.area[i] === area || L.near[i] === area,
      `pixel ${i} outside the region changed`,
    );
});

test("warming melts mountain snow", () => {
  const L = worldLayers();
  const snowWhite = (img: Uint8ClampedArray) => {
    let n = 0;
    for (let i = 0; i < MAP_W * 70; i++)
      if (img[i * 4] > 235 && img[i * 4 + 1] > 235 && L.kind[i] === 9) n++;
    return n;
  };
  const cool = createGame(),
    hot = createGame();
  cool.climate = 0.2;
  hot.climate = 2.8;
  assert(snowWhite(render(hot)) < snowWhite(render(cool)) / 2);
});

test("towns grow as you build", () => {
  const s = createGame();
  const before = render(s);
  s.civs.heartland.buildings.push("house", "farm", "kiln");
  assert(changed(before, render(s)).length > 30);
});
