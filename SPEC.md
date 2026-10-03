# MHacks 26 — Sustainability Battle-Royale Game (Spec)

> Status: concept not chosen yet. Four candidate concepts are below; they all share the same engine and architecture.

## Overview
A real-time multiplayer browser game with a sustainability theme. **Fun first; sustainability is the setting.**
- Many players start spread across several **arenas** ("servers").
- Each **round**, the weakest players are eliminated and the survivors **advance** into fewer, merged arenas, until **one player is left**.
- **AI agents** (Claude Sonnet 5.5, with a deterministic rule-engine fallback) fill empty slots and act as characters with their own agendas.
- **SpacetimeDB** is the core real-time backend: shared state, multiplayer sync, scheduled rounds, and persistence.

## Target tracks
| Track | How we qualify |
|---|---|
| Best Use of SpacetimeDB | All game state, rounds, and arena advancement live in SpacetimeDB tables + reducers |
| Best Design (Figma x MHacks) | Mock up in Figma first; polished, cohesive art direction |
| ElevenLabs | Distinct voices for AI characters (stretch) |
| Notability | Use Notability Pro for planning/sketches during the hackathon |
| Main track | Required: pick one main track (sustainability / social-good if available) |

---

## Candidate concepts

### A. Rising Tide (recommended)
Each arena is an island with **shared, regenerating resources** (fish, forest, fresh water, energy): a tragedy of the commons.
- **Rounds = years**, each ending in a climate event (storm, drought, heatwave). The more an island has polluted, the worse its event.
- **Advancement story:** seas rise and islands shrink. The bottom players are eliminated, and survivors become climate migrants merged onto fewer, bigger islands.
- **Score = wealth × island health.** Greedy players on a dead island score 0; broke saints also lose.
- **Actions:** harvest, plant, build (solar / seawall / desalinator), trade, propose policy + vote, chat.
- **AI characters:** fishing-company CEO, activist, farmer, skeptic politician. They negotiate, form coalitions, and sometimes defect.
- **End screen:** your island compared with a no-cooperation baseline.

### B. Net Zero City
Each player runs a city district inside a shared arena "city".
- They build industry (money) or green infrastructure (low emissions), and trade **carbon credits** with each other.
- The arena has a shared carbon budget. At the end of a round, districts over their share (or the lowest scores) are eliminated, and survivors merge into the next, stricter city.
- AI characters: lobbyists, mayors, and a credit speculator who manipulates prices.

### C. Reforest
A fast arcade-style co-op/competitive game.
- Players replant a dying ecosystem while fighting wildfires, drought, and invasive species that spread across the map in real time.
- Your score is the healthy land you personally restored. Survivors advance to harder biomes: forest → savanna → tundra → reef.
- AI characters: rival rangers and an AI "nature" director that spawns disasters.

### D. Ocean Cleanup
Players captain boats in shared waters.
- They collect plastic (points), fish (money), and can dump waste (cheap, but it hurts everyone).
- Pollution drifts **between arenas**, so one server's dumping hits its neighbors. The cleanest crews advance.
- AI characters: trawler captains, cleanup NGOs, and smugglers.

---

## Shared game engine

### Tournament flow
1. **Lobby:** players `join`; empty slots are back-filled with AI.
2. **Round live:** a timed round (configurable, e.g. 2–3 minutes) where players act.
3. **End of round** (scheduled reducer): resolve events, score, eliminate the bottom N per arena, then re-bucket survivors into `ceil(survivors / capacity)` new arenas.
4. Repeat until one winner. Eliminated players become **spectators** who can watch any arena (and bet in a prediction market, as a stretch goal).

Example bracket: 64 → 8 arenas of 8 → 32 in 4 → 16 in 2 → 8 in 1 → keep eliminating → 1 winner. Capacity, round length, and the number eliminated per round live in a `config` table and can be tuned live.

### Architecture
```
mhacks26/
  spacetime/          SpacetimeDB module: tables + reducers (TypeScript if module support is stable, else Rust)
  apps/web/           Next.js + React + Tailwind + Phaser; SpacetimeDB client SDK
  apps/orchestrator/  Node: SpacetimeDB client that runs AI agents (Sonnet 5.5 + rule engine)
```
Each "server" is an **arena row in one SpacetimeDB database**, not a separate database. Advancing a player means setting their `arena_id`, which happens in one transaction, so nobody is lost or duplicated mid-move.

### Core tables (concept-specific tables are added on top)
- `player` — identity (pk), name, is_ai, arena_id, status (`alive` | `eliminated` | `winner`), score, x, y
- `arena` — id, round, status (`lobby` | `live` | `resolving` | `closed`), capacity, health
- `tournament` — singleton: current_round, status, players_remaining
- `config` — capacity, round_seconds, eliminate_per_round
- `message` — arena_id, sender, text, ts
- `event_log` — arena_id, round, kind, payload (drives the replay, end screen, and markets)
- `round_timer` — scheduled table that fires `end_round`

### Core reducers
- `join(name)`, `start_tournament()`, `move(x, y)`, `say(text)`
- `end_round()` (scheduled): concept-specific resolution, then score → eliminate → re-bucket → schedule the next round
- Concept actions such as `harvest`, `build`, `trade`, `vote`, `plant`, `collect`. Each checks that the caller is `alive` and in that arena.

### Clients
- **Web** subscribes only to rows where `arena_id = <mine>`, and re-subscribes when it changes, playing a "moving to the next arena" transition.
- **Orchestrator** subscribes to AI players and calls the **same reducers** as humans (no backdoor).

### AI agents
- `RuleBrain`: deterministic utility scoring. The game is fully playable with no API key.
- `LlmBrain`: Claude Sonnet 5.5 (`claude-sonnet-5-5`) with tool use for structured actions, a persona system prompt per character (prompt-cached), and memory of recent events + relationships.
- `Orchestrator`: uses the LLM only for significant moments (negotiation, votes, new events); rules handle everything else. Falls back to rules on timeout (>4s), on error, or when the budget runs out.
- `CostGovernor`: token budget per hour and a cap on concurrent LLM calls.

## Build order
1. Module with `player` + `join`/`move`/`say`; one arena syncing live across tabs.
2. Arenas, `start_tournament`, scheduled `end_round` with a placeholder elimination rule. Proves advancement.
3. **Pick a concept** and add its resources, actions, and scoring.
4. AI characters: rules first, then Sonnet negotiation and personalities.
5. Visual polish (from Figma), spectator mode, arena-transition animation, end screen.
6. Stretch: ElevenLabs voices, a spectator prediction market.

## Deploy
- Web on Vercel.
- Module on SpacetimeDB Maincloud (or self-hosted).
- Orchestrator on a small always-on host (DigitalOcean + PM2) holding `ANTHROPIC_API_KEY`.

## Verification
- Run SpacetimeDB locally, publish the module, and open 3+ tabs with capacity 2 and 20-second rounds. Players land in separate arenas, eliminations happen, and survivors merge until one winner remains.
- With no `ANTHROPIC_API_KEY`: AI slots still play using rules.
- With a key: AI characters negotiate in chat; set a tiny budget and confirm they fall back to rules without stalling.
