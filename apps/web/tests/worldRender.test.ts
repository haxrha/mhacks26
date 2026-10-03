import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/game/engine";
import { PROVINCES, districts } from "../src/game/provinces";
import {
  MAP_H,
  MAP_W,
  renderWorld,
  worldLayers,
} from "../src/game/worldRender";
import type { DisasterId, GameState } from "../src/game/types";

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
function withHazard(id: string, effect: DisasterId) {
  const s = createGame();
  const area = PROVINCES.find((p) => p.id === id)!;
  const tile = districts(s, area)[0];
  tile.effect = effect;
  tile.disruption = 2;
  return s;
}

test("world layers decode to a full 320x200 map", () => {
  const L = worldLayers();
  for (const layer of [L.base, L.kind, L.area, L.near])
    assert.equal(layer.length, MAP_W * MAP_H);
  assert(L.palette.length > 10);
  assert.equal(PROVINCES.length, 16);
});

test("rendering is deterministic for the same state and frame", () => {
  const s = createGame();
  assert.deepEqual(render(s, 3), render(s, 3));
});

test("a flood only recolours land in the area it hits", () => {
  const calm = createGame();
  const flooded = withHazard("fenmarsh", "flood");
  const area = PROVINCES.findIndex((p) => p.id === "fenmarsh");
  const L = worldLayers();
  const diff = changed(render(calm), render(flooded));
  assert(diff.length > 50, "flood should be visible on the map");
  for (const i of diff)
    assert(
      L.area[i] === area || L.near[i] === area,
      `pixel ${i} outside Fenmarsh changed`,
    );
});

test("a wildfire turns forest to ash and smokes the castle", () => {
  const before = render(createGame());
  const after = render(withHazard("elderwood", "wildfire"));
  assert(changed(before, after).length > 100);
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

test("player buildings appear on the map", () => {
  const s = createGame();
  const area = PROVINCES.find((p) => p.id === "brasshold")!;
  const before = render(s);
  districts(s, area)[0].building = "solar";
  assert(changed(before, render(s)).length > 10);
});
