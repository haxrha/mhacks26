# Love AIsland — Spec

## Context
Love AIsland is a real-time multiplayer island simulation in the browser, where AI islanders (LLM agents with a deterministic rule-engine fallback) live alongside human players. Scope is **phased, MVP first**. Agents run on **Claude Sonnet 5.5** (`claude-sonnet-5-5`). Sonnet costs more per call than Haiku, so the design has to keep the number of LLM calls low: agents decide on a cadence, not every tick, and the rule engine covers everything in between.

## Architecture
pnpm workspaces + Turborepo, TypeScript everywhere.

```
mhacks26/
  apps/web/        Next.js (App Router) + React + Tailwind; Phaser canvas mounted in a client component
  apps/server/     Node + Socket.IO; authoritative game loop
  packages/shared/ types, zod schemas for socket events, constants (map size, tick rate)
  packages/agents/ orchestration: LLM brain, rule engine, memory, cost governor
```

- **Server is authoritative.** Fixed tick (10 Hz) in `apps/server/src/loop.ts` advances world state; clients send intents (`move`, `say`, `act`) and render server snapshots, interpolating between them.
- **Rooms**: one `Room` class per island instance (`apps/server/src/room.ts`), holding players, islanders, and world state in memory. Socket.IO rooms map 1:1.
- **Shared contract**: every socket event is defined once in `packages/shared/src/events.ts` as a zod schema plus TS type, and validated on the server on receipt.

### Agent layer (`packages/agents`)
- `Brain` interface: `decide(observation) -> Action`.
- `LlmBrain`: calls Sonnet 5.5 via `@anthropic-ai/sdk`, using tool use for structured actions (`move_to`, `talk_to`, `couple_up`, `challenge`, `idle`). Each islander gets a persona system prompt, which is prompt-cached.
- `RuleBrain`: deterministic utility scoring over needs (social, energy, attraction, rivalry). Always available.
- `Orchestrator`: per islander, picks a brain per decision. LLM only for "significant" moments (a conversation starts, a new event, every N seconds); otherwise `RuleBrain`. Falls back to `RuleBrain` on timeout (>4s), API error, or budget exhaustion.
- `CostGovernor`: per-room token budget per hour (env `AGENT_BUDGET_TOKENS_PER_HOUR`) and a max number of concurrent LLM calls. When the budget runs out, every agent degrades to the rule engine.
- `Memory`: a rolling short-term log per islander, plus a relationship matrix (affinity scores) the prompt reads from.
- LLM calls are async and never block the tick: the agent keeps executing its current plan until the decision resolves.

## Phases

### Phase 1: MVP (living island)
1. Scaffold the monorepo (Turborepo, pnpm, tsconfig base, eslint).
2. `packages/shared`: world types, event schemas.
3. `apps/server`: Socket.IO server, room create/join, tick loop, movement on a tile grid with collision, snapshot broadcast.
4. `apps/web`: lobby page (create/join room), game page with a Phaser scene (tilemap island, sprites, name tags, speech bubbles), keyboard movement, and chat input.
5. `packages/agents`: RuleBrain first (so the island works with no API key), then LlmBrain, Orchestrator, and CostGovernor.
6. Conversations: proximity-triggered dialogue between islanders, and between islanders and players. LLM generates the lines, which show as bubbles and in a side chat log.
7. Debug panel in web: per-agent current brain (LLM/rule), last action, tokens spent.

### Phase 2: Drama systems
- Events: a scheduled "director" (one Sonnet call every few minutes) injects events: recoupling, a newcomer arrives, a challenge.
- Combat/challenges: deterministic resolution (stats + RNG seeded per room) with LLM-written flavor text.
- Persistence: Postgres (Supabase or Neon) for rooms, islander profiles, and the event log, so rooms survive restarts.

### Phase 3: Prediction markets
- Players get play-money balances and bet on outcomes ("Will A and B couple up by the next recoupling?").
- An LMSR market maker in `apps/server/src/markets/`; markets resolve automatically from the event log.
- Market UI panel in web.

### Phase 4: Deploy
- Web on Vercel (`NEXT_PUBLIC_SERVER_URL` env).
- Server on a DigitalOcean droplet: PM2 (`ecosystem.config.js`, single instance, since state is in memory), and Caddy reverse proxy with auto-TLS and WebSocket passthrough (`Caddyfile`).
- CORS is locked to the Vercel domain. `ANTHROPIC_API_KEY` lives only on the droplet.

## Key decisions
- Socket.IO over raw WS: rooms, reconnection, and fallback come built in.
- In-memory authoritative state with a single PM2 instance. Horizontal scaling (Redis adapter, sharding rooms across processes) is out of scope until it's needed.
- The rule engine is a first-class brain, not an afterthought. The game has to be fully playable with `ANTHROPIC_API_KEY` unset.

## Verification
- `pnpm dev` runs web (:3000) and server (:4000) together. Open two browser tabs, join the same room, and confirm both see each other move in real time.
- With no API key: islanders wander, talk (templated lines), and the debug panel shows `rule` for every brain.
- With an API key: islanders hold LLM conversations; the debug panel shows `llm` decisions and token counts. Set a tiny budget and confirm agents degrade to `rule` without the loop stalling.
- Unit tests (vitest): RuleBrain scoring, CostGovernor limits, zod event validation, Orchestrator fallback on a mocked timeout or error.
- Phase 4: load the Vercel URL, confirm a WSS connection through Caddy, and run `pm2 logs` with no errors.
