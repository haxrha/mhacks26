# RISING WATERS — Hackathon Build Spec

> A 4-player, turn-based strategy game that teaches sustainability through **shared geography and externalities**. Four civilizations share one map, one climate, and one market. Every player chases their own prosperity, but hazards and pollution physically flow across the map onto neighbors. Players learn by watching their decisions land on someone else (and other players' decisions land on them).

**Core teaching principle:** Hazards are *conserved, not deleted*. A levee, dam, or seawall doesn't remove floodwater — it redirects it along the map's flow network onto someone else.

---

## 1. Game Overview

- **Players:** 4, each controlling one unique civilization class (no duplicates).
- **Length:** ~10 rounds, each round = "one decade."
- **Turn structure:** Simultaneous actions (all players act at once, then resolve) so no one waits on others.
- **Action economy:** 3 Action Points (AP) per player per round.
- **Win/lose:** Collective loss if climate crosses a threshold; otherwise individual scores; optional shared "Concordat" win (see §9).

---

## 2. Core Loop (each round)

1. **Income** — Each civ collects resources from its regions and buildings.
2. **Forecast** — The Enclave privately sees next round's likely hazards (probabilities + locations) and chooses to share (free, for Trust), sell (for Money), or hide.
3. **Action** — All players spend 3 AP simultaneously (build, research, trade, policy, aid, embargo, etc.). Action phase has a timer (e.g., 60–90s).
4. **Event Rolls** — Disaster and accident rolls per region (seeded RNG).
5. **Flow Phase (signature mechanic)** — The world map takes over the screen. Animated arrows show each hazard propagating along the flow network (river, wind, current, coastline, fault, aquifer). Captions attribute cause, e.g. *"Heartland's levee diverted 60% of flood → Enclave (−3 Food)."* Damage numbers pop where flows land.
6. **Market** — Global prices update from total supply/demand (embargoes and disasters cause spikes).
7. **Debrief Card** — Short real-world fact tied to the most significant event this round (e.g., Deepwater Horizon, Aral Sea, Banqiao Dam failure, 2010 Russian grain export ban).

---

## 3. Resources

Six resources:

| Resource | Notes |
|---|---|
| Food | Required for population; shortfall reduces wellbeing |
| Water | Required for food production and population |
| Energy | Powers buildings; fossil energy adds emissions |
| Materials | Needed to build infrastructure |
| Money | Trade currency, buys from market |
| Innovation | Research points for tech |

Each civ starts strong in roughly two resources and weak in one, so trading is necessary from round 1.

---

## 4. Global Shared State ("the Commons")

| Meter | Raised by | Effect |
|---|---|---|
| **Climate** (°C above baseline) | Fossil energy, deforestation, spills | Increases disaster frequency/severity for everyone |
| **Ocean Health** | Spills, overfishing, runoff | Scales fishing and coastal yields |
| **Market Prices** (Food, Energy, Materials, Water) | Supply/demand, embargoes, disasters | Determines costs of trade |
| **Global Trust** | Aid, open-sourcing tech, honored deals (+); embargoes, broken deals, hidden forecasts, pollution (−) | Trade discounts or tariffs; affects deal-making |

---

## 5. World Map & Geography

### 5.1 Layout

```
 ┌───────────────┬───────────────────────┐
 │  PETROSTATE   │      HEARTLAND        │
 │  (west,       │  (center, upstream    │  ┌───────────────┐
 │   upwind oil  │   river basin)        │  │               │
 │   highlands)  │   [DAM on fault]──river──▶│   ENCLAVE     │
 │   wind ──────▶│        ┆              │  │ (east, low    │
 │   wind ──────▶│        ┆ fault        │  │  river delta) │
 │               │   lowlands ◀── surge ─│──│               │
 └──────┬────────┴────────┆──────────────┘  └───────────────┘
   [OIL RIG]  ~~~ ocean current ~~~▶  ┆           SEA
            ~~~~~~~~~~~~~~~~~~~~~~~ [isle] [isle] [isle]
                                      ARCHIPELAGO (south)
```

- **Petrostate (west):** Upwind highlands with oil fields; offshore oil rig on its south coast.
- **Heartland (center):** Upstream river basin with farmland; controls the river headwaters; contains a dam site that sits **on the fault line**; has southern coastal lowlands.
- **Enclave (east):** Dense city on the low river delta; downstream of the river; coastal.
- **Archipelago (south):** Island chain in the sea; the fault runs from here north through the Heartland dam; sits on the tanker shipping lane.

### 5.2 Flow Network (typed directed edges)

The map is implemented as a **graph of regions with typed edges**. Each hazard has a *carrier type* and propagates only along edges of that type.

| Carrier | Direction | What travels on it |
|---|---|---|
| **River** | Downstream only (Heartland → Enclave) | Floods, dam-break floods, fertilizer runoff, water diversion (less water downstream) |
| **Wind** | Prevailing W→E (Petrostate → Heartland); **reverses ~1 in 4 rounds** | Smog, acid rain, wildfire smoke, volcanic ash |
| **Ocean Current** | One-way loop (Petrostate coast → Archipelago → ...) | Oil spills, plastic, fish stock migration |
| **Coastline** | Along coast in both directions | Storm surge; levees/seawalls push surge sideways onto neighbors |
| **Fault** | Undirected, decays with distance (Archipelago ↔ Heartland dam) | Earthquakes; damage anything built on the fault (dams, rigs, towers) |
| **Shared Aquifer** | Undirected pool (Petrostate ↔ Heartland) | Over-pumping by one civ lowers everyone's water yield |

### 5.3 Propagation Rules

- Each hazard is an **amount** at a source region. It spreads along matching edges, losing a decay factor per hop.
- **Conservation:** Infrastructure changes edge weights; it does not destroy the hazard.
  - Example: A levee sets "flood absorbed here" to 0.2 and passes the remaining 0.8 to the next downstream or coastal neighbor.
- Every flow carries a `causeId` linking back to the action or event that created or rerouted it. This powers:
  - Flow-phase captions and arrow attributions
  - End-game debrief timeline
- **Canonical chain example (must work in the demo):**
  1. Heartland builds a dam on the fault (cheap hydro energy).
  2. Earthquake originates in the Archipelago and propagates up the fault.
  3. Dam breaks → dam-break flood travels downstream through Heartland lowlands → into the Enclave delta.

---

## 6. Civilization Classes (rebalanced)

**Balance rule:** Every class gets **1 dominant resource, 1 geographic lever over a neighbor, 2 geographic vulnerabilities, and 1 hard dependency.**

| Class | Dominant | Geographic Lever (can hurt someone) | Vulnerabilities (hurt by) | Dependency |
|---|---|---|---|---|
| 🛢️ **Petrostate** | Energy | Wind carries emissions to Heartland; rig spills ride current to Archipelago | Tankers must cross Archipelago waters (chokepoint); shares aquifer with Heartland | Water (desert) |
| 🌾 **Heartland** | Food | Controls the river: dams, diversion, runoff all hit Enclave | Downwind of Petrostate; surge diverted onto its coast by Enclave | Innovation |
| 🏙️ **Enclave** | Innovation | Seawalls push storm surge onto Heartland coast; controls forecast information | Downstream of everything (river floods, dam breaks, diversion) | Food & Water |
| 🌋 **Archipelago** | Clean energy (geothermal) + fisheries | Shipping lane chokepoint: can tax or block Petrostate exports | Spills via ocean current; sits on the fault | Materials |

### 6.1 Class Details & Balance Notes

**🛢️ Petrostate**
- Massive fossil energy reserves, but they **deplete over rounds** (stranded-asset pressure).
- Both levers are pollution, so using them costs Trust; power is real but self-limiting.
- Can pivot to renewables at a significant cost (the "transition dilemma").
- Exposed to carbon tariffs from other civs as Climate rises.
- Each round of heavy fossil/offshore activity carries a chance of an **oil spill**.

**🌾 Heartland**
- Huge land, high food/materials/water; low innovation (slow research).
- Can clear forest for more land (big Climate cost).
- River control is strong, so it is paired with drought exposure, downwind smog, and its dam sitting on the fault. Overusing the river lever can backfire via the dam break.

**🏙️ Enclave**
- Tiny land, very high innovation and money.
- Unique buildings: **vertical farms** and **desalination**, which produce food and water without land but cost lots of energy.
- **Forecast lever:** sees hazards first; can share for Trust, sell for Money, or hide. Hiding is risky, since disasters hitting its food suppliers raise its own import costs.

**🌋 Archipelago**
- Fisheries, tourism money, cheap geothermal clean energy.
- 2–3× base disaster exposure (quakes, typhoons, sea-level rise).
- **Buffs:** shipping lane chokepoint lever; **Resilient Rebuild** passive (repairs cost 50%) so disasters hurt but don't snowball.
- Strongest incentive to push others on climate; can form a "climate coalition" bonus.

### 6.2 Lever Cycle (no one is untouchable)

```
Petrostate ──wind──▶ Heartland ──river──▶ Enclave ──surge──▶ Heartland
Petrostate ──current/spill──▶ Archipelago ──shipping lane──▶ Petrostate
Petrostate ◀──aquifer──▶ Heartland
Archipelago ──fault──▶ Heartland dam ──dam-break flood──▶ Enclave
```

---

## 7. Actions (each costs AP)

| Action | Effect |
|---|---|
| **Build** | Construct infrastructure (farms, energy plants, dams, levees, seawalls, vertical farms, desalination, grain reserves, grid storage). Some buildings modify flow edge weights. |
| **Research** | Spend Innovation to unlock tech. |
| **Trade** | Propose a resource swap (one-time or recurring multi-round deal). Breaking a deal costs Trust. |
| **Embargo / Monopolize** | Withhold a resource from market → price spike for others, short-term leverage, Trust drops. |
| **License Tech** | Sell a tech to another civ for Money. |
| **Open-Source Tech** | Everyone gets the tech; Trust boost; Climate falls faster. (Public goods vs. IP.) |
| **Aid** | Send resources to a disaster-hit civ; builds Trust; prevents cascades (refugees, market crash). |
| **Sanction / Carbon Tariff** | Penalize a high emitter's exports. |
| **Divert Water / Build Levee** | Protect own region; reroutes hazard to neighbors per flow rules. |
| **Block / Tax Shipping Lane** (Archipelago only) | Tax or block Petrostate exports. |
| **Share / Sell / Hide Forecast** (Enclave only) | Free action during Forecast phase. |

---

## 8. Disasters & Accidents

Per-region roll each round:

```
p(disaster) = base_rate[class][type] × (1 + climate_meter × k)
```

- Early game: ~5–10% per civ per round (rare, but not impossibly rare). Rises noticeably as Climate climbs — risk compounds.
- **Disaster types by region:**
  - Heartland: drought, river flood
  - Archipelago: typhoon, earthquake, sea-level rise
  - Enclave: heatwave, grid failure, delta flooding
  - Petrostate: refinery fire, oil spill (accident, scales with fossil activity)
  - Global: pandemic, supply-chain shock
- **Resilience buildings** (seawalls, grain reserves, grid storage, quake-proofing) reduce damage — but levees/seawalls redirect hazards via flow rules.

---

## 9. Win Conditions

- **Collective loss:** If Climate reaches **+3°C**, everyone loses. Show a "what happened" timeline.
- **Individual score:** `Prosperity (Money + population wellbeing) × Sustainability multiplier`.
- **Concordat (shared win, optional):** If all four civs sign a binding accord and honor it for 3 consecutive rounds, all four share the win.

The tension: play to beat the others, but if everyone does that, everyone loses.

---

## 10. Education Layer

- **Cause→effect cards** after events, linking to real cases: Deepwater Horizon, Aral Sea, Banqiao Dam failure (1975), 2010 Russian grain export ban, Netherlands smart agriculture, Tuvalu sea-level rise, Mekong/Nile upstream dam disputes, Chernobyl fallout drift.
- **End-game debrief:** Timeline graph of Climate and Ocean Health annotated with the decisions that moved them (via `causeId`), plus a replay of the biggest flow chains.
- **Classroom mode (stretch):** Teacher view projects the global map and meters; a class plays as four teams.

---

## 11. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript | Fast UI |
| Map rendering | SVG (regions as paths, flows as animated `stroke-dashoffset` arrows); Phaser optional | Simple, animatable, easy hit-testing |
| Multiplayer | Socket.io (or Colyseus for rooms/state sync) | 4-seat rooms, broadcast shared state |
| Game logic | **Pure reducer** `(state, actions[], seed) → { newState, flows[], events[] }` with seeded RNG | Deterministic, testable, replayable for debrief and scripted demo |
| Content | JSON files: classes, regions, edges, buildings, techs, events, fact cards | Teammates can tune balance without code changes |
| Optional AI | LLM generates "news headlines" from each round's state diff | Cheap wow factor |
| Deploy | Vercel (frontend) + Render/Fly.io (socket server) | Free tiers |

**Fallback:** Build **hot-seat mode first** (4 players, one screen). Networking layers on top of the same reducer.

### 11.1 Suggested Data Model (TypeScript sketch)

```ts
type Resource = "food" | "water" | "energy" | "materials" | "money" | "innovation";
type CivId = "petrostate" | "heartland" | "enclave" | "archipelago";
type Carrier = "river" | "wind" | "current" | "coast" | "fault" | "aquifer";

interface Region {
  id: string;
  owner: CivId | null;           // null = sea/neutral
  buildings: Building[];
  onFault: boolean;
  coastal: boolean;
}

interface Edge {
  from: string;                  // region id
  to: string;
  carrier: Carrier;
  directed: boolean;             // fault/aquifer = false
  weight: number;                // 0..1 pass-through; modified by buildings
  decay: number;                 // amount lost per hop
}

interface Building {
  type: string;                  // "dam" | "levee" | "seawall" | "vertical_farm" | ...
  owner: CivId;
  hp: number;
  edgeMods?: { edgeId: string; absorb: number; redirectTo?: string }[];
}

interface Civ {
  id: CivId;
  resources: Record<Resource, number>;
  population: number;
  wellbeing: number;
  techs: string[];
  deals: Deal[];
}

interface Hazard {
  id: string;
  type: string;                  // "flood" | "spill" | "smog" | "quake" | "surge" | ...
  carrier: Carrier;
  sourceRegion: string;
  amount: number;
  causeId: string;               // action or event that created/rerouted it
}

interface FlowEvent {            // emitted by reducer; drives arrow animation
  hazardId: string;
  from: string;
  to: string;
  carrier: Carrier;
  amount: number;
  causeId: string;
  caption: string;               // "Heartland's levee diverted 60% of flood → Enclave"
}

interface GameState {
  round: number;
  phase: "income" | "forecast" | "action" | "events" | "flow" | "market" | "debrief";
  civs: Record<CivId, Civ>;
  regions: Record<string, Region>;
  edges: Edge[];
  globals: { climate: number; oceanHealth: number; trust: number; prices: Record<Resource, number> };
  windDirection: "WE" | "EW";
  rngSeed: number;
  log: FlowEvent[];              // full history for debrief
}
```

### 11.2 Flow Propagation Algorithm (sketch)

```
for each hazard in hazards:
  queue = [(hazard.sourceRegion, hazard.amount, hazard.causeId)]
  while queue not empty:
    (region, amount, cause) = queue.pop()
    absorbed = amount × absorbFactor(region, hazard.type)   // buildings may absorb less and redirect
    applyDamage(region, absorbed, hazard.type)
    remaining = amount - absorbed
    for edge in outgoingEdges(region, hazard.carrier):      // respects wind direction, river downstream
      passed = remaining × edge.weight × (1 - edge.decay)
      if passed > threshold:
        newCause = edge was modified by a building ? building.actionId : cause
        emit FlowEvent(region → edge.to, passed, newCause)
        queue.push((edge.to, passed, newCause))
```

Special cases: quake damage to `onFault` buildings may spawn a **new hazard** (dam → `dam_break_flood` on river carrier) — this is how chains happen.

---

## 12. Draft Starting Config (TUNABLE — placeholder numbers)

```json
{
  "civs": {
    "petrostate":  { "food": 4, "water": 2, "energy": 12, "materials": 6, "money": 8, "innovation": 3,
                     "fossilReserves": 60, "baseDisaster": { "refinery_fire": 0.05, "spill": 0.08 } },
    "heartland":   { "food": 12, "water": 8, "energy": 4, "materials": 8, "money": 4, "innovation": 2,
                     "baseDisaster": { "drought": 0.08, "river_flood": 0.06 } },
    "enclave":     { "food": 2, "water": 2, "energy": 5, "materials": 4, "money": 10, "innovation": 12,
                     "baseDisaster": { "heatwave": 0.05, "delta_flood": 0.06 } },
    "archipelago": { "food": 7, "water": 5, "energy": 8, "materials": 2, "money": 7, "innovation": 5,
                     "baseDisaster": { "typhoon": 0.10, "quake": 0.08 }, "rebuildDiscount": 0.5 }
  },
  "globals": { "climate": 0.0, "climateLoss": 3.0, "oceanHealth": 100, "trust": 50, "disasterClimateK": 0.6 },
  "rounds": 10,
  "apPerRound": 3,
  "windReverseChance": 0.25
}
```

---

## 13. Scope

### MVP (must demo)
- [ ] 4 classes with distinct starting stats (config-driven)
- [ ] Shared region graph with typed edges (river, wind, current, coast, fault; aquifer optional)
- [ ] Round loop: Income → Forecast → Action → Events → **Flow** → Market → Debrief
- [ ] Actions: build (incl. dam, levee), trade, embargo, aid, open-source, research (simple)
- [ ] Climate meter + disaster rolls scaled by climate
- [ ] **Flow phase with animated arrows + cause captions**
- [ ] Dam-on-fault → quake → dam break → downstream flood chain
- [ ] Oil spill → current → Archipelago fisheries damage
- [ ] Fact cards
- [ ] End screen: collective loss / individual scores
- [ ] Hot-seat mode

### Stretch
- [ ] Online multiplayer (Socket.io)
- [ ] Tech tree
- [ ] Debrief timeline graph with causeId annotations
- [ ] LLM news ticker
- [ ] Classroom/teacher view
- [ ] AI bots for empty seats
- [ ] Wind reversal events, aquifer mechanics

---

## 14. Timeline (~24–36 hr hackathon)

| Hours | Work |
|---|---|
| 0–2 | Lock rules, numbers, JSON schema, region graph. Split work. |
| 2–10 | Parallel: reducer + flow propagation (with unit tests) ‖ SVG map + flow arrow animation ‖ content (classes, events, fact cards) |
| 10–16 | Wire UI to reducer in hot-seat mode. First full playthrough. |
| 16–22 | Balance pass (bot sims), disasters, end screen. Multiplayer if stable. |
| 22–28 | Polish, stretch goals, deploy. |
| Final 3 hrs | Feature freeze, scripted demo seed, pitch rehearsal. |

**4-person split:** (1) game engine + flow propagation, (2) frontend + map/flow animations, (3) multiplayer + deploy, (4) content/balance + pitch.

---

## 15. Balance Validation

- Once the reducer exists, run several hundred simulated games with random/greedy bots per class.
- Target: no class wins >35% or <15% of games. Tune starting numbers and base disaster rates before changing mechanics.
- Check that the Climate loss happens in a meaningful fraction of all-greedy games (the lesson must be reachable) but is avoidable with cooperation.

---

## 16. Demo Plan (3 minutes)

1. **30s — Problem:** Externalities are abstract and hard to teach.
2. **90s — Live play with a fixed RNG seed** so dramatic moments happen on cue:
   - Petrostate drills offshore → spill rides the current into Archipelago fisheries.
   - Heartland builds a dam → Archipelago quake travels up the fault → dam breaks → flood hits Enclave.
   - Enclave builds a seawall → surge diverted onto Heartland's coast.
   - Flow phase shows the arrows and captions for each.
3. **30s — Debrief:** Timeline showing which decisions caused which outcomes.
4. **30s — Impact & next steps:** Classroom mode, real-world fact cards.

---

## 17. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Balance broken | Reducer early + bot simulations |
| Too many mechanics | Cut tech tree and policy actions first; never cut the flow system or interactions |
| Slow turns | Simultaneous actions, action timer, 3 AP cap |
| Flow animations confusing | One carrier type at a time in sequence; color + line style per carrier; caption every arrow |
| Multiplayer breaks at demo | Hot-seat fallback using same reducer |
