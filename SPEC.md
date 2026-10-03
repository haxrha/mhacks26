# MHacks 26 — Survival of the Fittest: Sustainability Battle Royale (Spec)

> Status: the core loop is decided. The theme is still to be chosen from four concepts below; they all share the same engine.

## The pitch
Everyone spawns into a **Tier 1 server**: a harsh world with shared, limited natural resources. You have to **survive**: keep your food, water, and health up by gathering from an ecosystem everyone shares. Overharvest and the ecosystem collapses, and then everyone on that server starves.

When the round timer ends, **only the fittest survivors are evacuated to the next server**: a new, harsher world with fewer players. Everyone else is out. This repeats server by server until **one player survives the final server**.

Sustainability is not a side score; it is how you survive. Fun first, chaotic, multiplayer, with AI characters mixed in.

## Server progression (the core loop)
```
Tier 1:  8 servers × 8 players  (64)   mild world, abundant resources
            │  top 4 per server evacuate
Tier 2:  4 servers × 8 players  (32)   harsher: resources regrow slower, disasters more often
            │  top 4 per server
Tier 3:  2 servers × 8 players  (16)   brutal: scarce resources, frequent disasters
            │  top 4 per server
Tier 4:  1 server  × 8 players  (8)    final world: last one alive wins
```
- **Each tier is a different world**, with its own map, environment, and difficulty. Players experience it as moving to a new server.
- **You can die mid-round.** If your food, water, or health hits 0, you're eliminated immediately, before the timer ends.
- **At round end**, the remaining players on each server are ranked by **fitness**. The top K are evacuated (a transition cutscene plays), and the rest are eliminated.
- **The last tier** runs until one player is left alive. A sudden-death disaster ramps up until someone wins.
- **Eliminated players become spectators.** They can watch any server, and as a stretch goal bet on who survives.
- All numbers (servers per tier, players per server, K, round length) live in a `config` table and can be tuned live during the demo.

### Fitness (how "the fittest" is decided)
`fitness = survival_stats × contribution`
- **survival_stats:** your current food, water, and health. You have to stay alive and healthy.
- **contribution:** what you did for the server's ecosystem: things planted, cleaned, built, or shared, minus what you overharvested or polluted.
- So a hoarder who drained the ecosystem ranks low, and so does a saint who starved. **The fittest survive and keep their world alive.**
- Optional: a small perk carries into the next tier (an extra tool, a resource boost) as a reward for high fitness.

---

## Game design (look and feel)

### Style
- **Top-down 2D pixel art** (16×16 tiles, Phaser tilemaps), in the spirit of Stardew Valley or Don't Starve but cleaner and brighter. Fast to build, readable at a glance, and looks good in a demo.
- **Each tier has its own palette and mood**, so moving to the next server feels like arriving in a new world. Tier 1 is lush and saturated, and each tier gets darker, hotter, or stormier until the final tier looks apocalyptic.
- **The world shows how healthy the ecosystem is.** As `ecosystem_health` drops, grass browns, trees thin, water turns murky, and the screen slowly desaturates. You can see the server dying without reading a number.
- Hazards (fire, flood, storm) are animated and spread tile by tile. The screen edges flash red when you're in danger.

### In-game screen (desktop-first)
```
┌──────────────────────────────────────────────────────────────┐
│ ❤ ███████░░  🍖 █████░░░  💧 ████░░░░    TIER 2 · Server B   │
│ (your stats)                     ⏱ 1:42    #3 / 8 fitness ▲  │
│                                                              │
│                                                              │
│              [ top-down map, camera follows you ]            │
│        players with name tags · AI survivors · hazards       │
│                                                              │
│ ┌ chat ──────────────┐            ┌ server ecosystem ──────┐ │
│ │ Rex(AI): share fish?│            │ 🌳 62%  🐟 40%  💧 55% │ │
│ │ you: deal           │            └────────────────────────┘ │
│ └────────────────────┘                                       │
│     [E gather] [1 build] [2 plant] [3 clean] [4 share]       │
└──────────────────────────────────────────────────────────────┘
```
- **Top-left:** your survival bars (health, food, water).
- **Top-center:** the tier, server name, and round timer.
- **Top-right:** your live fitness rank. Above the top K ranks there's an evacuation line, so you always know whether you'd make it out.
- **Bottom-left:** chat, where AI survivors negotiate, beg, and betray.
- **Bottom-right:** the server's shared resource levels.
- **Bottom-center:** the action bar.
- **Controls:** WASD to move, E to gather, 1–4 for actions, Enter to chat.

### Screens and flow
1. **Landing:** title, a looping background of a dying-then-recovering world, and an "Enter name → Play" button.
2. **Lobby:** a player counter filling up ("41/64 survivors"), with AI slots shown as they back-fill.
3. **In-game:** as above.
4. **Evacuation cutscene** (around 5 seconds, the money shot): "YOU SURVIVED" → boat, plane, or raft leaving → the new tier's world fading in with its name ("TIER 3 — The Atoll").
5. **Death screen:** shows how you died ("Starved — the fish ran out") and a "Spectate" button.
6. **Spectator view:** a grid of every live server as mini-maps. Click one to watch it full screen.
7. **Winner screen:** the champion, plus a timeline of every server's ecosystem health across tiers showing who kept their world alive.

### Feel
- The pressure builds each round: the music tempo rises, hazards speed up, and in the last 30 seconds the timer pulses red and the evacuation line flashes.
- Short, punchy rounds (2–3 minutes), so a full tournament fits in a demo of about 10 minutes.
- Players should feel greed vs. cooperation in their gut: grabbing the last fish feels good, until the whole server starves.

---

## Theme candidates (all use the loop above)

### A. Rising Tide (recommended)
You're stranded on sinking islands. You fish, forage, collect rain, and build seawalls and desalinators. Storms and rising seas eat the map during the round. The fittest win a seat on the **evacuation boat** to the next island.
- Tiers: tropical island → mangrove delta → storm-battered atoll → the last dry rock.

### B. Wildfire
You're surviving a burning world. You gather water, food, and wood, plant firebreaks, and dodge fire spreading across the map in real time. Cutting too many trees makes the fires worse for everyone. The fittest get airlifted to the next region.
- Tiers: forest → savanna → drought canyon → ash wasteland.

### C. Drift
You're on rafts in a polluted ocean. You fish, filter water, and collect plastic to upgrade your raft. Dumping waste is cheap but poisons the fish for everyone. The fittest crews reach the next current.
- Tiers: calm bay → open sea → garbage gyre → the storm.

### D. Last City
You're in an overheating city. You keep power, water, and cool shelter running, and choose between dirty generators (fast, but they raise the heat for everyone) and solar or green roofs (slow, but sustainable). Heatwaves cause damage. The fittest get transferred to the next city.
- Tiers: suburb → downtown → industrial zone → megacity core.

---

## AI characters
Empty slots are filled with AI survivors who have personalities and agendas: a hoarder, a cooperative builder, a saboteur, a trader. They talk in chat, form alliances, share or steal, and sometimes betray. This drives the drama when few humans are playing.
- `RuleBrain`: deterministic survival logic (eat when hungry, gather the most-needed resource, flee disasters). The game is fully playable with no API key.
- `LlmBrain`: Claude Sonnet 5.5 (`claude-sonnet-5-5`) for social moments like negotiation, alliances, and betrayals. Uses tool use for structured actions and a prompt-cached persona per character.
- `Orchestrator`: rules handle routine survival; the LLM handles only significant moments. Falls back to rules on timeout (>4s), on error, or when the budget runs out.
- `CostGovernor`: token budget per hour and a cap on concurrent LLM calls.
- AI survivors call the **same reducers** humans do, with no backdoor, and they can be eliminated like anyone else.

---

## Technical design (SpacetimeDB)

### How "servers" are implemented
Each server is an **`arena` row with a `tier`** in a single SpacetimeDB database. Evacuating a player means changing their `arena_id`, in one transaction, so nobody is lost or duplicated during the handoff. To the player, each arena is a separate world with its own map, players, and chat. The client only subscribes to rows for its current arena, so it never sees other servers' data.

> Alternative: separate SpacetimeDB databases per tier are possible, but the handoff between them would need an external process and wouldn't be atomic. Only worth it if we need to scale far past demo size.

### Tables
- `player` — identity (pk), name, is_ai, arena_id, status (`alive` | `dead` | `evacuated` | `winner`), food, water, health, contribution, fitness, x, y
- `arena` — id, tier, status (`waiting` | `live` | `evacuating` | `closed`), capacity, ecosystem_health, hazard_level
- `resource` — arena_id, kind, stock, regen_rate (logistic regrowth; collapses if stock gets too low)
- `structure` — arena_id, owner, kind, x, y (seawall, firebreak, filter, …)
- `hazard` — arena_id, kind, x, y, radius (storm, fire, flood; spreads each tick)
- `tier_config` — tier, map_id, regen multiplier, hazard frequency, players_per_server, evacuate_k
- `config`, `tournament` (singleton), `message`, `event_log`
- Scheduled tables: `game_tick` (survival drain, regrowth, hazard spread) and `round_timer` (fires `end_round`)

### Reducers
- `join(name)`, `start_tournament()` (fills slots with AI and spreads players across Tier 1 servers)
- Survival actions: `move`, `gather(resource)`, `eat`, `drink`, `build(kind)`, `plant`, `clean`, `share(player, item)`, `say(text)`. Each checks that the caller is `alive` and in that arena.
- `tick()` (scheduled, ~1 Hz): drains food and water, applies hazard damage, kills players at 0, regrows resources, spreads hazards
- `end_round()` (scheduled): ranks the alive players by fitness, evacuates the top K into the next tier's servers, eliminates the rest, opens next-tier arenas, schedules the next round. On the last tier, switches to sudden death until one player is left.

### Repo layout
```
mhacks26/
  spacetime/          SpacetimeDB module (TypeScript if module support is stable, else Rust)
  apps/web/           Next.js + React + Tailwind + Phaser; SpacetimeDB client SDK
  apps/orchestrator/  Node: SpacetimeDB client that runs AI survivors (Sonnet 5.5 + rule engine)
```

## Target tracks
| Track | How we qualify |
|---|---|
| Best Use of SpacetimeDB | All state, survival ticks, hazards, and server-to-server evacuation run in SpacetimeDB |
| Best Design (Figma x MHacks) | A distinct look per tier, designed in Figma first |
| ElevenLabs | Voiced AI survivors and an evacuation announcer (stretch) |
| Notability | Use Notability Pro for planning/sketches |
| Main track | Required: pick one main track (sustainability / social-good if available) |

## Build order
1. One server: `join`, `move`, live sync across tabs.
2. Survival: food, water, and health drain, `gather`/`eat`/`drink`, regenerating resources, death at 0.
3. Server progression: tiers, `end_round`, fitness ranking, evacuation to the next server, spectators. **This is the core demo; get it working end to end early.**
4. **Pick a theme** and add its hazards, structures, and per-tier maps.
5. AI survivors: rules first, then Sonnet personalities and alliances.
6. Polish: evacuation cutscene, a distinct look per tier, a winner screen showing each tier's ecosystem health.
7. Stretch: ElevenLabs voices, a spectator betting market.

## Deploy (AWS, nothing runs locally)
- **Web:** AWS Amplify Hosting (`apps/web`, auto-deploys on push to `main`, build spec in `amplify.yml`).
- **Game server:** one EC2 t3.small with an Elastic IP, defined in CloudFormation (`infra/aws/stack.yaml`). It runs docker compose (`infra/docker-compose.yml`) with **Caddy** (automatic HTTPS/WSS at `<ip>.sslip.io`), **SpacetimeDB**, and the **AI orchestrator**.
- **Secrets:** `ANTHROPIC_API_KEY` is kept in SSM Parameter Store and never committed to git.
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`) authenticates to AWS through OIDC and runs `infra/aws/deploy.sh` on the instance via SSM.
- Setup steps are in [`infra/README.md`](infra/README.md).

## Verification
- Run locally with 2 servers per tier, 2 players per server, K = 1, and 30-second rounds, using 4+ browser tabs. Check that players die when stats hit 0, the fittest move to the next server's new world, and one winner is declared.
- Overharvest on purpose: the ecosystem collapses and that server starves out.
- With no `ANTHROPIC_API_KEY`: AI survivors still play and die using rules.
- With a key: AI survivors form alliances and betray in chat; set a tiny budget and confirm they fall back to rules without stalling.
