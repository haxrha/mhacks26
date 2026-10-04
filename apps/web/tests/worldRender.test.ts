import test from "node:test";
import assert from "node:assert/strict";
import {
  collapseFromTsunami,
  advance,
  applyAction,
  createGame,
  questionFor,
  answerQuiz,
} from "../src/game/engine";
import { TOWNS, townIndex } from "../src/game/towns";
import {
  areaStatus,
  MAP_H,
  MAP_W,
  renderWorld,
  worldLayers,
  renderWorldView,
  renderSwells,
  seaPixel,
  portRoute,
  fishingTraffic,
  tradeTraffic,
  tsunamiDirection,
  tsunamiHeading,
  tsunamiImpact,
  tsunamiCrest,
  OCEAN,
} from "../src/game/worldRender";
import {
  fireArrivals,
  hazardPaint,
  stormPosition,
  stormPickups,
} from "../src/game/hazardVisuals";
import visualConfig from "../../../src/data/disaster-visuals.json";
import {
  CIV_IDS,
  type CivId,
  type EventId,
  type GameState,
} from "../src/game/types";

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
  const s = createGame("heartland", "solo", 11);
  s.phase = "build";
  s.minorEvents = {};
  for (const c of Object.keys(s.events) as CivId[]) {
    s.events[c] = { type: "heatwave", loss: {} };
    s.civs[c].hazards = [];
    s.civs[c].choice = 2;
  }
  s.events[civ] = { type, loss: {} };
  return s;
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
      assert.deepEqual(seaPixel(x, y, 0), seaPixel(x, y, 5));
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

test("wildfire ignites irregular tree groups and grows on five-second ticks", () => {
  const L = worldLayers(),
    a = townIndex("enclave");
  const start = fireArrivals(L, a, 11, 0),
    later = fireArrivals(L, a, 11, 4);
  const count = (m: Int16Array) => [...m].filter((n) => n >= 0).length;
  assert(count(start) > 5);
  assert(count(later) > count(start) * 1.4);
  assert.deepEqual(fireArrivals(L, a, 11, 4), later);
  const state = withEvent("enclave", "wildfire");
  assert(changed(render(state, 0), render(state, 120)).length > 30);
});

test("all 19 event ids reach the live map status", () => {
  const ids: EventId[] = [
    "flood",
    "dam_failure",
    "hurricane",
    "earthquake",
    "tsunami",
    "volcano",
    "drought",
    "heatwave",
    "wildfire",
    "spill",
    "smog",
    "sea_rise",
    "landslide",
    "grid_failure",
    "pandemic",
    "supply_shock",
    "tornado",
    "small_quake",
    "mega_tsunami",
  ];
  for (const id of ids) {
    const state = withEvent("heartland", id);
    assert(areaStatus(state)[townIndex("heartland")].effects.has(id), id);
  }
});

test("each visual effect family changes map pixels", () => {
  const cases: [CivId, EventId][] = [
    ["heartland", "dam_failure"],
    ["archipelago", "hurricane"],
    ["archipelago", "earthquake"],
    ["archipelago", "volcano"],
    ["archipelago", "spill"],
    ["petrostate", "drought"],
    ["petrostate", "tornado"],
    ["archipelago", "small_quake"],
  ];
  for (const [civ, event] of cases) {
    const baseline = render(withEvent(civ, "heatwave"));
    const affected = render(withEvent(civ, event));
    assert(
      changed(baseline, affected).length > 0,
      `${event} should be visible`,
    );
  }
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

test("ordinary swells move across open sea and never paint land at any camera offset", () => {
  const L = worldLayers();
  for (const [originX, originY] of [
    [40, 20],
    [-75, -30],
  ]) {
    const view = {
      width: 400,
      height: 250,
      originX,
      originY,
      clip: { left: 0, top: 0, right: 400, bottom: 250 },
    };
    let hits = 0;
    for (let frame = 0; frame < 144; frame += 8) {
      const out = new Uint8ClampedArray(view.width * view.height * 4);
      renderSwells(frame, out, view);
      for (let i = 0; i < out.length; i += 4) {
        if (!out[i] && !out[i + 1] && !out[i + 2]) continue;
        hits++;
        const x = ((i / 4) % view.width) - originX;
        const y = Math.floor(i / 4 / view.width) - originY;
        if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H)
          assert(
            L.kind[y * MAP_W + x] <= 2,
            "swells must break before entering land or rivers",
          );
      }
    }
    assert(hits > 100, "travelling swells must remain visible after panning");
  }
});

test("wave positions are independent of camera pan and zoom", () => {
  const views = [
    { width: 400, height: 300, originX: 40, originY: 50 },
    { width: 550, height: 350, originX: 100, originY: 80 },
    { width: 260, height: 220, originX: -20, originY: -10 },
  ].map((v) => ({
    ...v,
    clip: { left: 0, top: 0, right: v.width, bottom: v.height },
  }));
  for (const frame of [12, 40, 75, 130]) {
    const images = views.map((v) => {
      const out = new Uint8ClampedArray(v.width * v.height * 4);
      renderSwells(frame, out, v);
      return out;
    });
    for (let y = 10; y < 170; y++)
      for (let x = 20; x < 230; x++) {
        const pixels = views.map((v, n) => {
          const o = ((y + v.originY) * v.width + x + v.originX) * 4;
          return images[n].slice(o, o + 4);
        });
        assert.deepEqual(pixels[0], pixels[1]);
        assert.deepEqual(pixels[0], pixels[2]);
      }
  }
});

test("compositor safely handles changing buffer sizes and fractional camera offsets", () => {
  for (const [width, height, bufferWidth, bufferHeight] of [
    [320, 200, 301, 182],
    [301, 182, 320, 200],
    [450.4, 270.7, 450, 270],
  ]) {
    const out = new Uint8ClampedArray(bufferWidth * bufferHeight * 4);
    assert.doesNotThrow(() =>
      renderWorldView(
        undefined,
        40,
        out,
        {
          width,
          height,
          originX: -50.25,
          originY: 12.75,
          clip: { left: 0, top: 0, right: width, bottom: height },
        },
        [],
      ),
    );
    assert.equal(out[3], 255, "the valid part of the buffer is still rendered");
  }
});

test("tsunami fronts stay attached to the world when the camera changes", () => {
  const state = withEvent("archipelago", "tsunami");
  const views = [
    { width: 400, height: 300, originX: 40, originY: 50 },
    { width: 550, height: 350, originX: 100, originY: 80 },
  ].map((v) => ({
    ...v,
    clip: { left: 0, top: 0, right: v.width, bottom: v.height },
  }));
  for (const frame of [12, 40, 65]) {
    const images = views.map((v) => {
      const out = new Uint8ClampedArray(v.width * v.height * 4);
      renderWorldView(state, frame, out, v, []);
      return out;
    });
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 320; x++) {
        const offsets = views.map(
          (v) => ((y + v.originY) * v.width + x + v.originX) * 4,
        );
        assert.deepEqual(
          images[0].slice(offsets[0], offsets[0] + 4),
          images[1].slice(offsets[1], offsets[1] + 4),
        );
      }
  }
});

test("local tsunami washes onto its own coastal land; major waves are wider and headings vary", () => {
  const normal = withEvent("archipelago", "tsunami"),
    major = withEvent("archipelago", "mega_tsunami"),
    quiet = withEvent("archipelago", "heatwave");
  const view = {
    width: 450,
    height: 300,
    originX: 65,
    originY: 40,
    clip: { left: 0, top: 0, right: 450, bottom: 300 },
  };
  const L = worldLayers(),
    area = townIndex("archipelago");
  let landHits = 0,
    normalPixels = 0,
    majorPixels = 0;
  for (const frame of [20, 40, 60, 80, 95]) {
    const images = [quiet, normal, major].map((state) => {
      const out = new Uint8ClampedArray(450 * 300 * 4);
      renderWorldView(state, frame, out, view, []);
      return out;
    });
    const smallDiff = changed(images[0], images[1]);
    normalPixels += smallDiff.length;
    majorPixels += changed(images[0], images[2]).length;
    for (const i of smallDiff) {
      const x = (i % 450) - 65,
        y = Math.floor(i / 450) - 40;
      if (
        x >= 0 &&
        x < MAP_W &&
        y >= 0 &&
        y < MAP_H &&
        L.kind[y * MAP_W + x] > 3
      ) {
        landHits++;
        assert.equal(
          L.area[y * MAP_W + x],
          area,
          "small tsunami cannot wash another region",
        );
      }
    }
  }
  assert(
    landHits > 40,
    "tsunami crest and wash must visibly cross onto coastal ground",
  );
  assert(
    majorPixels > normalPixels * 1.5,
    "major fronts must cover substantially more of the world",
  );
});

test("earthquake faults and shaking stay regional; fire storms have distinct animated debris", () => {
  const L = worldLayers(),
    quiet = withEvent("petrostate", "heatwave"),
    quake = withEvent("petrostate", "earthquake");
  const area = townIndex("petrostate");
  for (const i of changed(render(quiet, 8), render(quake, 8)))
    assert.equal(L.area[i], area);
  const storm = withEvent("enclave", "tornado"),
    fire = structuredClone(storm);
  fire.civs.enclave.hazards = [
    {
      type: "wildfire",
      severity: 2,
      remaining: 3,
      containment: 0,
      started: 1,
      origin: "enclave",
      destroyed: 0,
    },
  ];
  assert(changed(render(storm, 10), render(fire, 10)).length > 100);
  assert(changed(render(fire, 10), render(fire, 15)).length > 100);
});

test("new wildfire age is independent of an already-running map clock", () => {
  const L = worldLayers(),
    state = withEvent("enclave", "wildfire"),
    area = townIndex("enclave");
  const status = areaStatus(state);
  const fresh = hazardPaint(L, status, 0, state.seed, {
    [area]: { wildfire: 0 },
  });
  const lateMap = hazardPaint(L, status, 600, state.seed, {
    [area]: { wildfire: 0 },
  });
  const spread = hazardPaint(L, status, 600, state.seed, {
    [area]: { wildfire: 120 },
  });
  assert.deepEqual(fresh.under, lateMap.under);
  assert(changed(fresh.under, spread.under).length > 30);
});

test("tsunami passes clear before restarting and use their incident clock", () => {
  const view = {
    width: 450,
    height: 300,
    originX: 65,
    originY: 40,
    clip: { left: 0, top: 0, right: 450, bottom: 300 },
  };
  for (const type of ["tsunami", "mega_tsunami"] as const) {
    const state = withEvent("archipelago", type);
    const quiet = withEvent("archipelago", "heatwave");
    const area = townIndex("archipelago");
    const period =
      type === "tsunami" ? OCEAN.tsunami.frames : OCEAN.tsunami.largeFrames;
    const draw = (s: GameState, mapFrame: number, age: number) => {
      const out = new Uint8ClampedArray(view.width * view.height * 4);
      renderWorldView(s, mapFrame, out, view, [], { [area]: { [type]: age } });
      return out;
    };
    for (const age of [0, period + OCEAN.tsunami.restFrames])
      assert.equal(
        changed(draw(state, 700, age), draw(quiet, 700, age)).length,
        0,
        "no on-screen teleport at the cycle boundary",
      );
    assert(changed(draw(state, 700, 55), draw(quiet, 700, 55)).length > 200);
    state.civs.archipelago.hazards = [
      {
        type,
        severity: 2,
        remaining: 3,
        containment: 0,
        started: 1,
        origin: "archipelago",
        destroyed: 0,
      },
    ];
    const heading = tsunamiHeading(state, area, type === "mega_tsunami");
    state.round++;
    assert.deepEqual(
      tsunamiHeading(state, area, type === "mega_tsunami"),
      heading,
      "a continuing incident must not abruptly change direction next decade",
    );
  }
});

test("storm tracks travel across a region and collect actual boats and buildings", () => {
  const L = worldLayers();
  for (const [civ, type] of [
    ["archipelago", "hurricane"],
    ["enclave", "tornado"],
  ] as const) {
    const state = withEvent(civ, type),
      area = townIndex(civ);
    const status = areaStatus(state)[area];
    status.buildings.push("house", "farm", "house", "farm");
    const positions = Array.from({ length: 32 }, (_, n) =>
      stormPosition(L, area, n * 6, state.seed, type === "hurricane"),
    );
    assert(
      Math.max(...positions.map((p) => p[0])) -
        Math.min(...positions.map((p) => p[0])) >
        60,
      "storm translation must be noticeable across the map",
    );
    const early = stormPickups(
      L,
      area,
      status,
      0,
      state.seed,
      type === "hurricane",
    );
    const late = stormPickups(
      L,
      area,
      status,
      visualConfig.storm.period - 1,
      state.seed,
      type === "hurricane",
    );
    assert(
      late.length > early.length,
      "the moving storm must pick up new objects along its path",
    );
    assert(late.some((p) => p.kind === "roof"));
    if (type === "hurricane") assert(late.some((p) => p.kind === "boat"));
    if (type === "tornado") assert(late.some((p) => p.kind === "tree"));
    assert.deepEqual(
      late,
      stormPickups(
        L,
        area,
        status,
        visualConfig.storm.period - 1,
        state.seed,
        type === "hurricane",
      ),
    );
  }
});

test("storm movement stays continuous through region edges and repeated circuits", () => {
  const L = worldLayers();
  for (const area of [0, 1, 2, 3])
    for (const hurricane of [false, true]) {
      let previous = stormPosition(L, area, 0, 11, hurricane);
      for (let age = 0.25; age < visualConfig.storm.period * 3; age += 0.25) {
        const next = stormPosition(L, area, age, 11, hurricane);
        assert(
          Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 2,
          "no snapping between smooth path segments",
        );
        previous = next;
      }
      const a = stormPosition(
        L,
        area,
        visualConfig.storm.period * 4 + 20,
        11,
        hurricane,
      );
      const b = stormPosition(
        L,
        area,
        visualConfig.storm.period * 4 + 60,
        11,
        hurricane,
      );
      assert(
        Math.hypot(a[0] - b[0], a[1] - b[1]) > 10,
        "a long-running storm must keep travelling",
      );
    }
  assert.equal(OCEAN.fps, 60);
  assert.equal(
    OCEAN.timelineFps,
    6,
    "animation rate must not accelerate disaster timing",
  );
});

test("volcanic eruption has expanding lava, a plume and ash rather than wildfire alone", () => {
  const state = withEvent("heartland", "volcano"),
    quiet = withEvent("heartland", "heatwave");
  assert(changed(render(quiet, 30), render(state, 30)).length > 400);
  assert(changed(render(state, 6), render(state, 90)).length > 250);
});

test("tsunami aftermath floods land, damages forest appearance and clears snow, then recovers", () => {
  const L = worldLayers(),
    view = {
      width: MAP_W,
      height: MAP_H,
      originX: 0,
      originY: 0,
      clip: { left: 0, top: 0, right: MAP_W, bottom: MAP_H },
    };
  const state = withEvent("archipelago", "mega_tsunami"),
    quiet = withEvent("archipelago", "heatwave");
  const draw = (s: GameState, age: number) => {
    const out = new Uint8ClampedArray(MAP_W * MAP_H * 4);
    renderWorldView(s, 12, out, view, [], {
      [townIndex("archipelago")]: { mega_tsunami: age },
    });
    return out;
  };
  let flooded = 0,
    forest = 0,
    snow = 0;
  for (const age of [85, 110, 145, 165])
    for (const i of changed(draw(quiet, age), draw(state, age))) {
      if ([6, 7, 10, 11].includes(L.kind[i])) flooded++;
      if (L.kind[i] === 5) forest++;
      if ([8, 9].includes(L.kind[i])) snow++;
    }
  assert(
    flooded > 1000,
    "broad lowlands must visibly remain inundated behind the crest",
  );
  assert(
    forest > 100,
    "forest must show temporary wet patches and fallen trunks",
  );
  assert(snow > 20, "snow caps must be visibly cleared");
  assert(
    changed(draw(quiet, 150), draw(state, 150)).length > 100,
    "aftermath persists after the wave pass",
  );
  assert.equal(
    changed(
      draw(state, OCEAN.tsunami.largeFrames + OCEAN.tsunami.restFrames),
      draw(quiet, 0),
    ).length,
    0,
  );
});

test("local tsunami crests wash the targeted coast across varied approach angles", () => {
  const L = worldLayers();
  const view = {
    width: 420,
    height: 280,
    originX: 50,
    originY: 40,
    clip: { left: 0, top: 0, right: 420, bottom: 280 },
  };
  for (const civ of ["archipelago", "enclave", "petrostate"] as const)
    for (const seed of [11, 7929, 260926]) {
      const state = withEvent(civ, "tsunami"),
        quiet = withEvent(civ, "heatwave");
      state.seed = quiet.seed = seed;
      let land = 0;
      for (const frame of [45, 65, 80]) {
        const images = [quiet, state].map((s) => {
          const out = new Uint8ClampedArray(view.width * view.height * 4);
          renderWorldView(s, frame, out, view, []);
          return out;
        });
        for (const p of changed(images[0], images[1])) {
          const x = (p % view.width) - view.originX,
            y = Math.floor(p / view.width) - view.originY;
          if (
            x >= 0 &&
            y >= 0 &&
            x < MAP_W &&
            y < MAP_H &&
            L.kind[y * MAP_W + x] > 3
          ) {
            land++;
            assert.equal(L.area[y * MAP_W + x], townIndex(civ));
          }
        }
      }
      assert(land > 20, `${civ} seed ${seed} must visibly wash inland`);
    }
});

test("tsunamis cannot create disconnected crests in upstream rivers", () => {
  const L = worldLayers();
  const state = withEvent("archipelago", "tsunami"),
    quiet = withEvent("archipelago", "heatwave");
  const view = {
    width: MAP_W,
    height: MAP_H,
    originX: 0,
    originY: 0,
    clip: { left: 0, top: 0, right: MAP_W, bottom: MAP_H },
  };
  for (const frame of [30, 55, 75, 85]) {
    const images = [quiet, state].map((s) => {
      const out = new Uint8ClampedArray(MAP_W * MAP_H * 4);
      renderWorldView(s, frame, out, view, []);
      return out;
    });
    for (const i of changed(images[0], images[1]))
      if (L.kind[i] === 3) {
        assert(L.distSea[i] < OCEAN.tsunami.coastalReach);
        assert.equal(L.area[i], townIndex("archipelago"));
      }
  }
});

test("a long tsunami front deforms locally instead of translating as a rigid curve", () => {
  const a = Array.from({ length: 100 }, (_, x) => tsunamiCrest(x, 40, true));
  const b = Array.from({ length: 100 }, (_, x) => tsunamiCrest(x, 45, true));
  const motion = b.map((v, x) => v - a[x]);
  assert(Math.max(...motion) - Math.min(...motion) > 4);
  assert(Math.max(...a) - Math.min(...a) > 6);
});

test("catastrophic flow sweeps moored boats far inland and removes the original hull", () => {
  const state = createGame("archipelago", "solo", 93);
  state.phase = "build";
  for (const c of CIV_IDS) {
    state.events[c] = { type: "heatwave", started: 1, loss: {} };
    state.civs[c].hazards = [];
  }
  state.minorEvents = {};
  state.events.archipelago = {
    type: "mega_tsunami",
    started: 1,
    loss: {},
  };
  const [x, y] = portRoute("archipelago")[0];
  const impact = tsunamiImpact(state, x, y + 2, 140);
  assert(impact?.large);
  assert(impact.distance > 60);
  const before = new Uint8ClampedArray(MAP_W * MAP_H * 4),
    after = new Uint8ClampedArray(before.length);
  renderWorld(state, 0, before, []);
  renderWorld(state, 140, after, []);
  const brownHull = (out: Uint8ClampedArray) => {
    let n = 0;
    for (let yy = y + 2; yy < y + 6; yy++)
      for (let xx = x; xx < x + 5; xx++) {
        const o = (yy * MAP_W + xx) * 4;
        if (out[o] === 111 && out[o + 1] === 72 && out[o + 2] === 38) n++;
      }
    return n;
  };
  assert(brownHull(before) > 0);
  assert.equal(brownHull(after), 0);
});

test("tsunami overlay is opaque above scenery, includes mountains, and leaves unhit pixels transparent", () => {
  const state = withEvent("archipelago", "mega_tsunami");
  const view = {
    width: MAP_W,
    height: MAP_H,
    originX: 0,
    originY: 0,
    clip: { left: 0, top: 0, right: MAP_W, bottom: MAP_H },
  };
  const out = new Uint8ClampedArray(MAP_W * MAP_H * 4),
    overlay = new Uint8ClampedArray(out.length);
  renderWorldView(state, 84, out, view, [], undefined, overlay);
  const L = worldLayers();
  let mountains = 0,
    covered = 0,
    clear = 0;
  for (let i = 0; i < L.kind.length; i++) {
    if (overlay[i * 4 + 3]) {
      covered++;
      if ([8, 9].includes(L.kind[i])) mountains++;
      assert.equal(overlay[i * 4], out[i * 4]);
    } else clear++;
  }
  assert(mountains > 100);
  assert(covered > 1000);
  assert(clear > 1000);
});

test("the dead world stays inundated after the final wave without restarting or recovering", () => {
  const state = withEvent("archipelago", "mega_tsunami");
  collapseFromTsunami(state);
  const view = {
    width: MAP_W,
    height: MAP_H,
    originX: 0,
    originY: 0,
    clip: { left: 0, top: 0, right: MAP_W, bottom: MAP_H },
  };
  const out = new Uint8ClampedArray(MAP_W * MAP_H * 4),
    overlay = new Uint8ClampedArray(out.length);
  renderWorldView(state, 1000, out, view, [], undefined, overlay);
  const L = worldLayers();
  let ruinedLand = 0;
  for (let i = 0; i < L.kind.length; i++)
    if (L.kind[i] > 3 && overlay[i * 4 + 3] === 255) ruinedLand++;
  assert(ruinedLand > 15000);
  assert.equal(state.phase, "ended");
});

test("merged map docks touch shoreline and the working harbour fleet sails on connected water", () => {
  const L = worldLayers();
  for (const civ of CIV_IDS) {
    const [x, y] = portRoute(civ)[0];
    assert(L.kind[y * MAP_W + x] <= 3);
    assert(
      [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(
        ([xx, yy]) =>
          xx >= 0 &&
          yy >= 0 &&
          xx < MAP_W &&
          yy < MAP_H &&
          L.kind[yy * MAP_W + xx] > 3,
      ),
    );
  }
  const starts = fishingTraffic(0);
  assert.equal(starts.length, 3);
  assert.notDeepEqual(starts, fishingTraffic(40));
  for (let frame = 0; frame < 150; frame++) {
    for (const boat of fishingTraffic(frame)) {
      const bob = ((frame + Number(boat.id.split(":")[1])) >> 1) & 1;
      const center = (boat.y + 3 - bob) * MAP_W + boat.x + 1;
      assert(L.kind[center] <= 3, "fishing boat route crossed land");
    }
  }
});

test("storms collect the new moving fishing fleet and shoreline moorings", () => {
  const L = worldLayers();
  const state = withEvent("archipelago", "hurricane");
  const area = townIndex("archipelago");
  const [x, y] = portRoute("archipelago")[0];
  let mooring = false,
    fishing = false;
  for (let seed = 0; seed < 30; seed++) {
    const picks = stormPickups(
      L,
      area,
      areaStatus(state)[area],
      384,
      seed,
      true,
    );
    for (const p of picks) {
      if (p.id === `port:${area}`) {
        mooring = true;
        assert.equal(p.x, x);
        assert.equal(p.y, y + 2);
      }
      if (p.id.startsWith("fishing:")) {
        fishing = true;
        const boat = fishingTraffic(p.caught).find((b) => b.id === p.id)!;
        assert.equal(p.x, boat.x);
        assert.equal(p.y, boat.y);
      }
    }
  }
  assert(mooring && fishing);
});
