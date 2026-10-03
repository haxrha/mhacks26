# Earthshare

A playable environmental strategy tycoon built entirely in TypeScript: Next.js/React in the browser, and a native SpacetimeDB 2.10.2 module as the backend. There is no Flask or Python game server.

Four civilizations share a living economy and the consequences of their decisions. Build infrastructure, research clean technologies, negotiate recurring trades, give aid, impose embargoes, and manage disasters. The game includes 16 distinct hazards, 16 buildings, 12 technologies, and 70 original educational questions with source links. Its ten-decade loop supports offline practice, four-player hot-seat practice, persistent online solo worlds, and live multiplayer room codes with AI filling unclaimed seats.

The world uses `assets/world-map.png`, the repository's 16 castle provinces, wood HUD controls, parchment inspectors, and pixel fonts. Castle provinces currently group the expanded specification's 56 simulation districts. These are illustrative regions rather than a terrain-derived water simulation.

## Run locally on Windows

Install Node.js 24 and [SpacetimeDB 2.10.2](https://spacetimedb.com/install). This workspace also has an ignored portable CLI under `.tools/spacetime/`.

```powershell
npm ci --prefix apps/web
npm ci --prefix spacetime
npm run db:start
```

Keep that terminal open. In a second terminal at the repository root:

```powershell
npm run db:publish
npm run db:generate
npm run dev
```

Open http://127.0.0.1:3000. The frontend defaults to `ws://127.0.0.1:3001` and database `earthshare-game`. Select **Create saved solo world**, or select **4-player hot-seat** then **Create multiplayer world**. Friends select an unclaimed civilization and join with the six-character room code. The practice button plays locally without the database.

Every real player locks their plan before resolution. The host advances the flow and debrief phases. Each player answers their own emergency quiz. To reconnect, use the same browser and room code: the SDK identity is retained locally. A different browser profile is a different player. For multiple computers, use a reachable backend URL as described below.

## Verify

```powershell
npm run typecheck
npm test
npm run build
npm run test:integration  # local SpacetimeDB must be running and published
```

The integration check opens two independent identities and tests synchronized rooms, ownership, stale revisions, readiness, and host-only advancement. It creates a fresh test room each run. `npm --prefix apps/web run simulate` exercises 400 seeded worlds; it is a stability check, not proof of competitive balance.

## Connect your SpacetimeDB account

See [the complete setup guide](docs/SPACETIMEDB.md). The frontend needs only a WebSocket URL and a database name; do not put publisher credentials into browser environment variables. Cloud publishing requires your own CLI login and an available database name. No cloud resources have been deployed by this foundation.

## Source layout

- `apps/web/src/game/`: shared deterministic rules, types, question access, and live SDK hook.
- `spacetime/src/index.ts`: native module tables and reducers; imports the same tested rules.
- `apps/web/src/module_bindings/`: generated official SDK bindings.
- `src/data/`: authored balance, buildings, technologies, hazards, geography, and quizzes.
- `apps/web/src/components/`: world, economy, technology, diplomacy, learning, timeline, and results.
- `assets/`: original world and reference art; runtime art is copied to `apps/web/public/assets/`.

[Architecture and simulation assumptions](docs/ARCHITECTURE.md) · [Remaining production work](docs/ROADMAP.md)
