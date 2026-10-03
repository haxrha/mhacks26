# AGENTS.md — EARTHSHARE

> One river. Four civilizations. Every choice flows downstream.

A 4-player, turn-based strategy game for a sustainability hackathon. Each player runs a civilization with a unique starting class. The civs share one map and one river, so one player's choices (a dam release, a clear-cut, factory runoff) land on their neighbors. Players learn sustainability mostly by **managing** these trade-offs. Short timed quizzes during climate events are a secondary mechanic.

This file tells a coding agent what to build and how. The visual reference is the **EARTHSHARE — 8-bit Reference** design canvas, which has four artboards: World Map, Civilizations, Game Screen (HUD) and Climate Event Quiz. The map image is `assets/world-map-v2.png`. Match these references. Don't redesign them.

---

## 1. Ground rules for agents

- **Hackathon scope.** Build the MVP in §10 first and keep it playable at every commit. Add stretch goals only after it runs end-to-end.
- **Data-driven.** Put civs, buildings, techs, events and quiz questions in JSON under `src/data/`. Don't hard-code balance numbers in logic.
- **Pure game state.** `GameState` is a plain serializable object. All rules are pure functions `(state, action) => newState`, which makes them easy to test, replay and sync over the network later.
- **Pixel-perfect rendering.** Use nearest-neighbor scaling everywhere: `image-rendering: pixelated` and `pixelArt: true` in Phaser. Don't use anti-aliasing, blur, gradients or soft shadows. Shadows are hard 3–8 px black offsets.
- **Accessibility.** Text contrast must be at least 4.5:1. Never use color alone to carry meaning: add an icon, a label or a pattern. Every action must work by mouse and by keyboard.
- **Don't** add real-money mechanics, chat, accounts or analytics. Don't add copyrighted sprites or fonts beyond the two Google Fonts below.

## 2. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Team knows it, and types catch rule bugs |
| Engine | Phaser 3 + Vite | Fast 2D tilemaps, pixel-art mode, quick HMR |
| UI overlay | HTML/CSS panels over the canvas (or Phaser DOM) | HUD text is easier and more accessible in DOM |
| State | Pure reducer in `src/core/` | Testable and network-ready |
| Tests | Vitest | Unit-test the rules and hazard propagation |
| Multiplayer | Hot-seat first. Later: Socket.IO room with server-authoritative reducer | Keeps the demo safe |

## 3. Folder layout

```
earthshare/
  AGENTS.md
  index.html
  src/
    main.ts                 # Phaser boot, scenes
    core/                   # NO Phaser imports in here
      state.ts              # GameState types
      reducer.ts            # applyAction(state, action)
      turn.ts               # end-of-turn pipeline (§6)
      hazards.ts            # hazard triggers + downstream propagation (§7)
      flow.ts               # river flow graph (§5.3)
      rng.ts                # seeded RNG (mulberry32)
    data/
      civs.json  buildings.json  techs.json  events.json  quiz.json  map.json
    scenes/
      MapScene.ts  HudScene.ts  EventScene.ts  CivSelectScene.ts
    ui/                     # DOM panels: top bar, side panels, action bar, modal
    assets/
      world-map-v2.png  emblem-*.png  tiles.png (sprite sheet)
  tests/
```

## 4. Art direction

**Look.** NES/SNES-era 8-bit, with an earthy, living palette. The map is the hero, so UI chrome stays dark and quiet.

- **Tiles.** The map is 320 × 200 tiles at 4 px, rendered at 1280 × 800. Gameplay uses a coarser **logic grid of 40 × 25 cells**, each 8 × 8 tiles (32 px on screen). Players click logic cells, not single tiles.
- **Fonts.** `Press Start 2P` for headings, labels and buttons (10–34 px). `VT323` for body text and numbers (20–28 px).
- **UI palette.**
  - ground `#0b0d12`
  - panel `#12151c`
  - raised `#1b202b`
  - track `#2c3340`
  - text `#ecebe1`
  - muted `#a9b0bd`
  - gold accent `#f5c542`
  - danger `#e8642c`
- **Civ colors.** Use these for borders, tags and emblems:
  - Highland `#a07ad6`
  - Verdant `#7fd65a`
  - Forge `#f08a3c`
  - Tidehaven `#46d6d0`
- **Terrain palette** (selected):
  - deep sea `#16233f`
  - sea `#21497a`
  - shallow `#2b6fa0`
  - river `#3a9bd2`
  - grass `#5e9c3c`
  - forest `#3d7a2e`
  - wheat `#d9bb4a`
  - soil `#8a6238`
  - rock `#776e60`
  - snow `#f4f4ec`
  - sand `#e6cf8a`
  - sludge (pollution) `#6e6230`
  - flood `#6ab8cc`
  - ash `#3a3632`
- **Panels.** 3–4 px solid borders, 3–8 px hard black drop-shadow, no rounded corners.

### 4.1 HUD style: a management sim, not a dashboard

The in-game screen follows RollerCoaster Tycoon: **the world fills the screen**, and UI sits at the edges or in small windows the player opens.

- **Wood + parchment.** Use these materials instead of flat dark panels.
  - **Raised bevel** (buttons, window frames):
    - face `#8a5a32`
    - light edge (top/left) `#c48a52`
    - dark edge (bottom/right) `#3e2414`
    - 1 px outline `#1a120a`
  - **Pressed or active:** swap the edge colors and use face `#5e3c20`.
  - **Parchment body:** `#efe2bc` / `#f7d9a0`, text `#2a1a0e` / `#4a2410`.
  - **Inset wells** in the status bar: `#2a1a0e` with inverted bevel, cream text `#f4e6c0`.
- **Top toolbar (48 px).** Only pixel icon buttons (24 px icons in 40×38 buttons), grouped:
  - left: pause / save / options, then zoom in / zoom out / map overlays
  - right: plant forest / farm / wind turbine / wetland / seawall / more, then research / trade / diplomacy / policy
  - a groove fills the gap between the two sides

  Labels appear only as tooltips. Every button still needs `aria-label`.
- **Bottom status bar (68 px).** Like RCT's money/news/date bar:
  - civ emblem plus 5 resource chips (wealth, food, energy, tech, pollution)
  - news ticker with a "show on map" button
  - **planet health** as 10 segments, plus temperature, season and turn
  - a big gold **END TURN** button
- **Inspector windows.** Click a map object (dam, factory, capital) to open a draggable window:
  - title bar in the owner's civ color, with a red bevel close button
  - icon tabs
  - a zoomed viewport of the object
  - 2–3 bars
  - one decision
  - one warning
  - Never more than one or two windows open.
- **Thought bubbles.** Show each neighbor's mood as a pixel bubble over its capital: heart, smog or alert. Don't add a neighbors panel.
- **No side panels, no tables, no charts on the main screen.** History and stats live in window tabs.
- **Animation.** Use 2–4 frame loops only: water shimmer, smoke puffs, fire flicker and turbine spin. Step at 4–8 fps.

## 5. The world

### 5.1 Regions (see World Map artboard)

| Region | Owner | Terrain | Landmarks |
|---|---|---|---|
| North (tile y < 66) | P1 Highland Hold | Snow peaks, rock, hills, pasture | Glacier, reservoir, **dam**, 3 mines |
| West of river (66 ≤ y < 146) | P2 Verdant Reach | Dense forest, marsh, farm plots | Tributary, windmill, wildfire zone |
| East of river (66 ≤ y < 146) | P3 Forge Dominion | Plains, fields, hills | 3 factories, sludge pond, wind farm, solar |
| South (y ≥ 146) | P4 Tidehaven | Delta, marsh, beach, sea | Port docks, lighthouse, fishing grounds |

The river is the West/East border, so Verdant and Forge share both banks.

### 5.2 Logic cell

```ts
type Terrain = 'mountain'|'hill'|'meadow'|'forest'|'field'|'marsh'|'river'|'reservoir'|'sand'|'sea';
interface Cell {
  x: number; y: number; terrain: Terrain; owner: CivId | null;
  building?: BuildingId; flooded?: number /* turns left */; burnt?: number;
  pollution: number /* 0-10 */; elevation: number /* 0-9, drives water flow */;
}
```

### 5.3 River flow graph

Every river and reservoir cell points to one downstream cell, forming a tree that ends at the sea. Hazards and pollution move along this graph each turn (§7). `map.json` stores `downstream: [x, y]` per water cell. Build it once from the elevation data.

## 6. Turn loop

1. **Upkeep.** Each civ gains Food, Energy, Wealth and Tech from its cells and buildings, and pays upkeep.
2. **Player phase.** Players act in seat order, each with **3 actions**: Build, Research, Trade, Policy, Diplomacy, or (Highland only) set the Dam Gate.
3. **World phase.**
   - Global CO₂ += Σ emissions − Σ sinks.
   - Temperature follows CO₂ with a lag.
   - Pollution flows downstream (§7).
4. **Hazard roll.** A seeded RNG rolls each hazard, weighted by temperature, local state and season.
5. **Climate event.** When a hazard fires, open the Event modal (§8).
6. **Check end.** The game ends at year 2100 (1 turn = 2 years, starting in 2018, so 41 turns), or earlier if temperature reaches +3.0°C (shared loss).

**Win condition.** All civs share one goal: keep warming under +2.0°C by 2100. If they do, everyone wins together, and individual civs are then ranked by Prosperity (wealth + food + happiness) minus Pollution. If they fail, everyone loses. This combines a co-op goal with competitive scoring.

## 7. Shared hazards (the core teaching mechanic)

Each hazard has a cause, a carrier along the map, and victims. Effects must be **shown on the map**: flooded cells turn to the flood pattern, burnt cells to ash, and polluted water to sludge streaks.

| Hazard | Cause (who) | Carrier | Hits |
|---|---|---|---|
| Dam overtopping / break | Reservoir high, high temp (glacier melt), dam stress ≥ 90 | River graph, BFS downstream with decay | Floodplain cells of Verdant, Forge, Tidehaven |
| Spillway release | Highland chooses Release | River graph, 1 turn | Downstream farms: −food, flooded 2 turns |
| River pollution | Forge factories without filters, sludge pond | +pollution per downstream hop, decays 10%/hop | Tidehaven fishing, river-side farms |
| Landslide / silt | Clear-cut on slopes (Verdant or Highland) | Adjacent downhill cells and river | River capacity ↓ (raises flood risk) |
| Wildfire | Heat ≥ +1.2°C, dry season, forest density | Spreads to adjacent forest, can cross the border | Verdant, plus Highland pasture |
| Sea-level rise / storm surge | Global temp | Coastline cells | Tidehaven only, the "last to know" |
| Heat wave / smog | Global temp + local pollution | Region-wide | Happiness ↓ (Forge worst) |

**Mitigations.** These are the management lessons:
- wetlands buffer: absorbs flood energy
- reforestation: carbon sink and slope stability
- filters and clean tech
- early, small dam releases
- seawalls vs. managed retreat
- trade embargoes to pressure polluters
- shared funds, where two or more civs co-pay a project

## 8. Climate events as character dialogue (see Event 1 and Event 2 artboards)

Events play out like Stardew Valley conversations, not pop-up forms.

1. **Pause and pan.**
   - Pause the game and pan the camera to the source of the event.
   - Draw the hazard on the map, e.g. a blue spill below the dam.
   - Show a "!" bubble over the source.
   - Fade the toolbar to 55%, and hide the bottom bar.
2. **Event sign.** A wooden sign hangs from the top showing the event name and turn. Below it, impact tags show each hit civ's emblem with its loss.
3. **Dialogue box (bottom, about 1140×290).**
   - Wood frame, with a parchment text panel on the left in VT323 at 28–30 px.
   - Portrait panel on the right: a 32×32 pixel portrait shown at 160 px, with a nameplate giving the name and civ.
   - Text types out character by character (about 40 chars/s). Click to skip.
4. **Event 1: your advisor asks the quiz.** Your civ's advisor (e.g. *Warden Ostra*, Highland) explains the event in plain speech and asks one question. Show 4 answers as dialogue choices: ▶ pointer, highlight on hover/focus, keys 1–4. A 10-segment hourglass timer runs **20 s**.
   - Correct: recovery time 3 turns → 1.
   - Wrong or timed out: full 3 turns.
   - The quiz never decides who wins. It only speeds up recovery.
5. **Event 2: an affected neighbor speaks.** A neighbor's character (e.g. *Harbormaster Pell*, Tidehaven) responds. A small toast at the top shows the quiz result plus a one-line explanation.
6. **Response choice.** This is the real lesson. Pick 1 of 3 management responses as dialogue choices, each with its trade-off written beside it. Example:
   - *Build a wetland buffer together*: split the cost
   - *Open the spillway early*: your farms flood, theirs don't
   - *Evacuate*: −wealth, nobody hurt
   Post the choice to every civ's news ticker.
7. **Cast.** Each civ has one advisor and one envoy portrait. Envoys appear in other civs' events.
   - Highland: Warden Ostra (dam keeper)
   - Verdant: Elder Moss (grove elder)
   - Forge: Foreman Brask (foreman)
   - Tidehaven: Harbormaster Pell (harbormaster)

   Add portraits to `assets/portraits/` and speaker lines to `events.json`, e.g. `"lines": {"advisor": "...", "neighbor": "..."}`.

```json
// quiz.json item
{ "id": "flood-01", "event": "flood", "q": "Which landscape feature best soaks up floodwater before it reaches towns?",
  "options": ["Concrete levees", "Restored wetlands", "Cleared hillsides", "Paved floodplain"],
  "answer": 1, "explain": "Wetlands store and slow water like a sponge, lowering downstream peaks." }
```

Each event type needs at least 8 questions so they don't repeat within a game. Keep questions factual and sourced. Add a `source` field.

## 9. Civilizations (see Civilizations artboard)

Starting stats are on a 1–5 scale (×10 = starting stock).

| Civ | Food | Energy | Wealth | Tech | Pollution | Resilience | Ability | Exposure |
|---|---|---|---|---|---|---|---|---|
| Highland Hold | 2 | 5 | 3 | 3 | 2 | 3 | **Dam Gate**: Hold/Trickle/Release each turn | Glacier melt shrinks the reservoir |
| Verdant Reach | 5 | 2 | 2 | 2 | 1 | 4 | **Carbon Sink**: forests reduce global CO₂ | Wildfire |
| Forge Dominion | 2 | 4 | 5 | 5 | 5 | 2 | **Retrofit**: clean tech at half cost | Smog, heat waves |
| Tidehaven | 3 | 2 | 4 | 3 | 2 | 2 | **Harbor**: controls sea trade, can embargo | Gets every flood and pollutant, plus sea-level rise |

## 10. Screens and MVP

| Screen | Artboard | MVP? |
|---|---|---|
| Leader select, arcade "player select" style (see below) | Civilizations | ✅ |
| Main game: full-screen map, icon toolbar, status bar, inspector window, thought bubbles (§4.1) | Game Screen (HUD) | ✅ |
| Event dialogue: advisor quiz → neighbor plea + response (§8) | Event 1, Event 2 | ✅ |
| End screen (shared result + ranking) | — (to design) | ✅ simple |
| Tech tree, diplomacy screen, online multiplayer, animated tiles | — | stretch |

**Leader select screen.**
- **Background:** crimson `#6e2029` with dot dither, and a confetti-diamond stage that gets denser toward a cream floor strip.
- **Header:**
  - left: a huge cropped close-up of the highlighted leader's portrait, which swaps as you browse
  - right: the title, plus a cream narration box
- **Four columns.** Each column, from top to bottom:
  - a diamond in the civ color
  - the role
  - the leader name
  - the civ name
  - the full-body sprite (32×48 drawn at 6×) standing on the floor
  - a house-shaped player badge, either 1P–4P in the civ color or OPEN
- **Highlighted column:** gold corner brackets plus a floating "1P" cursor.
- **Bottom strip:** portrait, ability, exposure, six stat bars, and a gold CONFIRM button.
- **Hot-seat picking:** players pick in turn. Arrow keys browse and Enter picks.

**MVP definition of done.** Four hot-seat players can play 10+ turns. At least the flood, pollution and wildfire hazards fire and visibly propagate across borders. The quiz modal works. The game ends with a shared result.

## 11. Testing checklist

- [ ] The reducer is deterministic for a given seed. Replaying an action log reproduces the state.
- [ ] A dam release floods only cells downstream of the dam, never upstream.
- [ ] Pollution decays per hop and never goes negative.
- [ ] Quiz timeout counts as wrong. The timer pauses if the tab is hidden.
- [ ] The map renders crisply at 1×, 2× and 0.625× (no blur).
- [ ] All buttons are at least 44 px and reachable by keyboard. Focus rings are visible.
