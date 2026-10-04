import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDINGS,
  ECONOMY,
  EVENTS,
  RESEARCH,
  RISK,
} from "../src/game/content";
import {
  advance,
  answerQuiz,
  applyAction,
  createGame,
  income,
  questionFor,
  resolveEvents,
  rollEvents,
  cycleClimate,
} from "../src/game/engine";
import {
  canTriggerMegaTsunami,
  damageBuildings,
  drawRegionalEvents,
  ensureHazard,
  eventLoss,
  profile,
  recover,
  tickRecovery,
  upkeep,
  productionPenalty,
} from "../src/game/disasters";

test("major tsunami leaves world-wide damage after the immediate hazard and permits restoration", () => {
  const s = buildState();
  const h = ensureHazard(s, "heartland", {
    type: "mega_tsunami",
    severity: 3,
    loss: { wheat: 4 },
  });
  assert(h.remaining >= 6);
  for (const c of CIV_IDS) {
    assert.equal(
      s.civs[c].damageScars?.[0].remaining,
      RISK.destruction.mega_tsunami.scarRounds,
    );
    assert(productionPenalty(s.civs[c], "wood") > 0.3);
  }
  s.civs.heartland.hazards = [];
  const before = s.civs.heartland.damageScars![0].remaining;
  const fixed = applyAction(s, {
    type: "contain",
    civ: "heartland",
    hazard: "mega_tsunami",
  });
  assert(!fixed.error);
  assert(fixed.state.civs.heartland.damageScars![0].remaining < before);
  assert(
    s.civs.heartland.damageScars![0].remaining === before,
    "rules preserve the input state",
  );
});

test("catastrophic destruction is stronger but retains a productive recovery foothold", () => {
  const s = buildState(),
    c = s.civs.heartland;
  c.buildings = [
    "house",
    "house",
    "house",
    "house",
    "house",
    "house",
    "house",
    "house",
    "farm",
    "farm",
    "lumber",
    "grove",
    "kiln",
    "pasture",
  ];
  const h = ensureHazard(s, "heartland", {
    type: "mega_tsunami",
    severity: 3,
    loss: { wheat: 4 },
  });
  let destroyed = 0;
  for (let round = 0; round < 5; round++)
    destroyed += damageBuildings(s, "heartland", h, 2, () => 0, 4).length;
  assert.equal(destroyed, RISK.destruction.mega_tsunami.cap);
  assert(c.buildings.some((id) => BUILDINGS[id]?.yields));
  assert.equal(c.damageScars![0].destroyed, destroyed);
});
import { CIV_IDS, RESOURCES, type EventId } from "../src/game/types";
import {
  MAP_H,
  MAP_W,
  OCEAN,
  renderWorld,
  surfMask,
  worldLayers,
} from "../src/game/worldRender";

function buildState() {
  const s = createGame("heartland", "hotseat", 17);
  s.phase = "build";
  s.minorEvents = {};
  s.scheduled = [];
  for (const c of CIV_IDS) {
    for (const r of RESOURCES) s.civs[c].stock[r] = 10;
    s.civs[c].hazards = [];
    s.civs[c].choice = 2;
  }
  return s;
}

test("serious loss survives quiz, defenses and a sustainable response", () => {
  const s = buildState(),
    c = s.civs.heartland;
  c.quiz = { questionId: "example", correct: true };
  c.buildings.push("firewatch");
  const loss = eventLoss(
    s,
    "heartland",
    { type: "wildfire", severity: 2, loss: { wood: 3, sheep: 1 } },
    1,
  );
  assert(Object.values(loss).reduce((n, x) => n + x, 0) >= 1);
  const cheap = eventLoss(
    s,
    "heartland",
    { type: "wildfire", loss: { wood: 3, sheep: 1 } },
    0,
  );
  assert(
    Object.values(cheap).some((n) => n > 0),
    "cheap fixes no longer erase all local losses",
  );
});

test("fire can grow after temporary containment fades; funded recovery shortens it", () => {
  const s = buildState();
  const h = ensureHazard(s, "heartland", {
    type: "wildfire",
    severity: 2,
    loss: { wood: 3 },
  });
  h.containment = RISK.cheapContainment;
  h.severity = 1.6;
  tickRecovery(s, "heartland");
  const held = h.severity;
  tickRecovery(s, "heartland");
  assert(h.severity > held);
  const copy = structuredClone(s);
  recover(copy.civs.heartland, "wildfire");
  assert((copy.civs.heartland.hazards?.[0]?.severity ?? 0) < h.severity);
  assert((copy.civs.heartland.hazards?.[0]?.remaining ?? 0) < h.remaining);
});

test("destroyed structures fit the hazard and destruction stays bounded", () => {
  const s = buildState(),
    c = s.civs.heartland;
  c.buildings = ["house", "house", "lumber", "farm", "mine", "microgrid"];
  const h = ensureHazard(s, "heartland", {
    type: "wildfire",
    severity: 3,
    loss: { wood: 3 },
  });
  const killed = damageBuildings(s, "heartland", h, 2, () => 0, 1);
  assert.equal(killed.length, 1);
  assert(profile("wildfire").vulnerable.includes(killed[0] as never));
  assert.deepEqual(
    damageBuildings(s, "heartland", h, 2, () => 0, 1),
    [],
  );
  assert(c.buildings.includes("mine") && c.buildings.includes("microgrid"));
  const quake = ensureHazard(s, "heartland", {
    type: "earthquake",
    severity: 3,
    loss: { ore: 3 },
  });
  c.buildings = ["mine"];
  assert.deepEqual(
    damageBuildings(s, "heartland", quake, 2, () => 0, 1),
    [],
    "last producer survives as a recovery foothold",
  );
});

test("major incidents are rare and regional cooldowns prevent repeated fresh catastrophes", () => {
  let major = 0,
    total = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const s = createGame("heartland", "solo", seed);
    for (let round = 1; round <= 10; round++) {
      s.round = round;
      s.scheduled = [];
      const previous = CIV_IDS.map((c) => s.civs[c].lastMajor);
      rollEvents(s);
      for (const [i, c] of CIV_IDS.entries()) {
        total++;
        assert(s.minorEvents?.[c], "routine pressures continue every round");
        if (profile(s.events[c].type).major) {
          major++;
          if (previous[i] !== undefined)
            assert(round - previous[i]! >= RISK.majorCooldown);
        }
      }
    }
  }
  assert(
    major / total > 0.05 && major / total < 0.2,
    `${major}/${total} fresh major incidents`,
  );
});

test("fossil communities can leak oil without refineries; renewable communities stop being sources", () => {
  let found = false;
  for (let seed = 1; seed < 1000; seed++) {
    const s = createGame("heartland", "solo", seed);
    if (Object.values(s.events).some((e) => e.type === "spill")) found = true;
    for (const c of CIV_IDS) {
      s.civs[c].buildings = ["windmill"];
      s.civs[c].hazards = [];
      s.civs[c].lastMajor = -10;
    }
    s.scheduled = [];
    s.rng = seed;
    rollEvents(s);
    assert(!Object.values(s.events).some((e) => e.type === "spill"));
  }
  assert(
    found,
    "ordinary fossil fuel storage and transport must carry oil risk",
  );
  let refinery = false;
  for (let seed = 1; seed < 2000 && !refinery; seed++) {
    const s = buildState();
    for (const c of CIV_IDS) s.civs[c].buildings = ["windmill"];
    s.civs.petrostate.buildings.push("refinery");
    s.rng = seed;
    rollEvents(s);
    for (const c of CIV_IDS)
      if (s.events[c].type === "spill") {
        refinery = true;
        assert.equal(s.events[c].origin, "petrostate");
      }
  }
  assert(refinery, "a refinery still handles oil even beside renewable power");
});

test("delayed coastal waves retain location and earthquake causality", () => {
  const s = buildState();
  s.scheduled = [
    {
      type: "mega_tsunami",
      target: "archipelago",
      origin: "archipelago",
      arrives: 2,
      severity: 3,
      reason: "Offshore earthquake displaced the seabed.",
    },
  ];
  rollEvents(s);
  assert.notEqual(s.events.archipelago.type, "mega_tsunami");
  s.round = 2;
  rollEvents(s);
  assert.equal(s.events.archipelago.type, "mega_tsunami");
  assert.match(s.events.archipelago.reason!, /earthquake/);
  assert(
    CIV_IDS.filter((c) => c !== "archipelago").every(
      (c) => s.events[c].type !== "mega_tsunami",
    ),
  );
  assert(
    !s.scheduled!.some((h) => h.type === "earthquake"),
    "a wave does not create a tectonic earthquake",
  );
});

test("offshore earthquake rolls schedule waves, inland quakes never do", () => {
  let coastal = false,
    inland = false;
  for (let seed = 1; seed < 6000 && !(coastal && inland); seed++) {
    const s = createGame("heartland", "solo", seed);
    if (
      s.events.archipelago.type === "earthquake" &&
      s.scheduled?.some(
        (h) => h.type === "tsunami" || h.type === "mega_tsunami",
      )
    )
      coastal = true;
    for (const c of ["heartland", "enclave", "petrostate"] as const)
      if (s.events[c].type === "earthquake") {
        inland = true;
        assert(
          !s.scheduled?.some(
            (h) =>
              h.origin === c &&
              (h.type === "tsunami" || h.type === "mega_tsunami"),
          ),
        );
      }
  }
  assert(coastal && inland);
});

test("dam-break pulses travel downstream after a delay", () => {
  let found = false;
  for (let seed = 1; seed < 4000 && !found; seed++) {
    const s = createGame("heartland", "solo", seed);
    if (s.events.heartland.type !== "dam_failure") continue;
    found = true;
    const floods = s.scheduled!.filter(
      (h) => h.origin === "heartland" && h.type === "flood",
    );
    assert.deepEqual(floods.map((h) => h.target).sort(), [
      "enclave",
      "petrostate",
    ]);
    assert(floods.every((h) => h.arrives === 2));
  }
  assert(found);
});

test("research has costs, prerequisites, time and real emissions/unlock effects", () => {
  let s = buildState();
  assert(
    applyAction(s, { type: "build", civ: "heartland", building: "solar" })
      .error,
  );
  assert(
    applyAction(s, {
      type: "research",
      civ: "heartland",
      technology: "energy_storage",
    }).error,
  );
  const before = s.civs.heartland.stock.ore;
  s = applyAction(s, {
    type: "research",
    civ: "heartland",
    technology: "solar_power",
  }).state;
  assert.equal(
    s.civs.heartland.stock.ore,
    before - RESEARCH.solar_power.cost.ore!,
  );
  assert.equal(s.civs.heartland.actionsUsed, 1);
  tickRecovery(s, "heartland");
  assert(!s.civs.heartland.technologies!.includes("solar_power"));
  tickRecovery(s, "heartland");
  assert(s.civs.heartland.technologies!.includes("solar_power"));
  assert.equal(
    applyAction(s, { type: "build", civ: "heartland", building: "solar" })
      .error,
    undefined,
  );
  s.civs.heartland.buildings.push("kiln");
  const clean = cycleClimate(s);
  s.civs.heartland.technologies = [];
  assert(cycleClimate(s) > clean);
});

test("projects are limited, upkeep scales and hoarding reaches a storage cap", () => {
  let s = buildState();
  for (let i = 0; i < ECONOMY.actionsPerRound; i++)
    s = applyAction(s, {
      type: "build",
      civ: "heartland",
      building: "farm",
    }).state;
  assert(
    applyAction(s, { type: "build", civ: "heartland", building: "house" })
      .error,
  );
  assert.equal(
    applyAction(s, {
      type: "exchange",
      civ: "heartland",
      give: "wood",
      get: "ore",
    }).error,
    undefined,
  );
  s.civs.heartland.buildings.push("house", "house", "house");
  assert(upkeep(s.civs.heartland).wheat > ECONOMY.foodUpkeep);
  for (const c of CIV_IDS) s.civs[c].ready = true;
  s.civs.heartland.ready = false;
  s = applyAction(s, { type: "ready", civ: "heartland" }).state;
  for (const c of CIV_IDS)
    for (const r of RESOURCES)
      assert(s.civs[c].stock[r] <= ECONOMY.storageCapacity);
});

test("neglected damage lowers future output even with no stored goods to lose", () => {
  const s = buildState();
  s.civs.heartland.buildings = ["lumber", "farm"];
  const before = income(s, "heartland").wood;
  ensureHazard(s, "heartland", {
    type: "wildfire",
    severity: 3,
    loss: { wood: 3 },
  });
  assert(income(s, "heartland").wood < before);
  for (const r of RESOURCES) s.civs.heartland.stock[r] = 0;
  s.events.heartland = { type: "wildfire", severity: 3, loss: { wood: 3 } };
  resolveEvents(s);
  assert(!s.civs.heartland.report.some((l) => /lost nothing/.test(l)));
  assert(s.civs.heartland.hazards!.length);
});

test("surf reaches all four coasts while remaining entirely on water", () => {
  const mask = surfMask(),
    L = worldLayers();
  let count = 0,
    left = false,
    right = false,
    north = false,
    south = false;
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      count++;
      assert(L.kind[i] <= 2);
      const x = i % MAP_W;
      left ||= x < 100;
      right ||= x > 220;
      north ||= i / MAP_W < 50;
      south ||= i / MAP_W > 170;
    }
  assert(count > 30 && left && right && north && south);
});

test("legacy version-2 saves without recovery fields remain playable", () => {
  const s = createGame("heartland", "solo", 4);
  for (const c of CIV_IDS) {
    delete s.civs[c].hazards;
    delete s.civs[c].technologies;
    delete s.civs[c].actionsUsed;
  }
  delete s.scheduled;
  delete s.minorEvents;
  let next = advance(s);
  const q = questionFor(next, "heartland")!;
  next = answerQuiz(next, "heartland", q.correct, 1000);
  next = applyAction(next, { type: "acknowledge", civ: "heartland" }).state;
  next = applyAction(next, {
    type: "choose",
    civ: "heartland",
    option: 2,
  }).state;
  assert.equal(next.phase, "build");
  assert(next.civs.heartland.hazards?.length);
});

test("small fractional output survives across rounds instead of being rounded away forever", () => {
  let s = buildState();
  s.civs.heartland.buildings = ["farm"];
  ensureHazard(s, "heartland", {
    type: "heatwave",
    severity: 1,
    loss: { wheat: 1 },
  });
  assert.equal(income(s, "heartland").wheat, 0);
  for (const c of CIV_IDS) s.civs[c].ready = true;
  s.civs.heartland.ready = false;
  s = applyAction(s, { type: "ready", civ: "heartland" }).state;
  assert((s.civs.heartland.productionCarry?.wheat ?? 0) > 0);
  assert(income(s, "heartland").wheat >= 1);
});

test("coastal foam arrives intermittently and then clears", () => {
  const mask = surfMask(),
    i = mask.findIndex((n) => n === OCEAN.surf.coastalReach);
  assert(i >= 0);
  const x = i % MAP_W,
    y = Math.floor(i / MAP_W);
  const patch =
    Math.floor(x / OCEAN.surf.patchWidth) +
    Math.floor(y / OCEAN.surf.patchWidth) * 31;
  const phase = (patch * 17) % OCEAN.surf.period;
  const start = (OCEAN.surf.period - phase) % OCEAN.surf.period;
  const a = new Uint8ClampedArray(MAP_W * MAP_H * 4),
    b = new Uint8ClampedArray(a.length);
  renderWorld(undefined, start, a, []);
  renderWorld(undefined, start + OCEAN.surf.activeFrames, b, []);
  assert.deepEqual([...a.slice(i * 4, i * 4 + 3)], [159, 214, 228]);
  assert.notDeepEqual(
    [...a.slice(i * 4, i * 4 + 3)],
    [...b.slice(i * 4, i * 4 + 3)],
  );
});

test("retired events never roll and wind interacting with fire increases incident severity", () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = createGame("enclave", "solo", seed);
    for (const event of [
      ...Object.values(s.events),
      ...Object.values(s.minorEvents ?? {}),
    ])
      assert(!RISK.disabledEvents.includes(event.type));
  }
  const s = buildState();
  ensureHazard(s, "enclave", { type: "wildfire", severity: 2, loss: {} });
  const storm = ensureHazard(s, "enclave", {
    type: "tornado",
    severity: 2,
    loss: {},
  });
  assert(storm.severity > 2 && storm.severity <= RISK.maxSeverity);
});

test("fire storms destroy combustible structures that ordinary tornado wind leaves standing", () => {
  const s = buildState();
  s.civs.enclave.buildings = ["grove", "lumber", "farm"];
  const wind = ensureHazard(s, "enclave", {
    type: "tornado",
    severity: 3,
    loss: {},
  });
  assert.deepEqual(
    damageBuildings(s, "enclave", wind, 2, () => 0, 2),
    ["farm"],
  );
  ensureHazard(s, "enclave", { type: "wildfire", severity: 2, loss: {} });
  assert.deepEqual(
    damageBuildings(s, "enclave", wind, 2, () => 0, 2),
    ["grove"],
  );
  assert.deepEqual(s.civs.enclave.buildings, ["lumber"]);
});

test("catastrophic tsunami requires severe warming and cannot repeat during recovery", () => {
  const s = buildState();
  s.climate = RISK.megaTsunamiClimateThreshold - 0.01;
  assert.equal(canTriggerMegaTsunami(s), false);
  s.climate = RISK.megaTsunamiClimateThreshold;
  assert.equal(canTriggerMegaTsunami(s), true);
  ensureHazard(s, "archipelago", {
    type: "mega_tsunami",
    severity: 3,
    loss: {},
  });
  assert.equal(canTriggerMegaTsunami(s), false);
  s.civs.archipelago.hazards = [];
  assert.equal(canTriggerMegaTsunami(s), false);
  assert(RISK.majorWaveChance <= 0.02);
});

test("a delayed catastrophic wave creates persistent damage across all regions", () => {
  const s = buildState();
  s.scheduled = [
    {
      type: "mega_tsunami",
      target: "archipelago",
      origin: "archipelago",
      arrives: s.round,
      severity: 3,
      reason: "Offshore rupture",
    },
  ];
  rollEvents(s);
  const h = ensureHazard(s, "archipelago", s.events.archipelago);
  for (const c of CIV_IDS)
    assert(
      s.civs[c].damageScars?.some(
        (scar) => scar.type === "mega_tsunami" && scar.started === h.started,
      ),
    );
  ensureHazard(s, "archipelago", s.events.archipelago);
  assert.equal(
    s.civs.archipelago.damageScars?.filter((x) => x.type === "mega_tsunami")
      .length,
    1,
  );
});
