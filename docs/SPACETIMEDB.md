# SpacetimeDB setup

## Architecture

Earthshare uses a native TypeScript module running inside SpacetimeDB's V8 runtime. The browser subscribes through the official TypeScript SDK. The database stores rooms, claimed civilization seats, state revisions, and private quiz clocks. Reducers perform actions and turn transitions atomically; the browser never submits a replacement game state. No Flask, Python bridge, REST relay, or API key is needed.

The SDK and module dependency are pinned through lockfiles at 2.10.2. Generated bindings are checked in. Regenerate after changing reducer parameters or tables. Shared game state contains only JSON values, so cloning works both in browsers and the native runtime.

## Local setup

The root `npm run db:start`, `db:publish`, and `db:generate` scripts are Windows PowerShell helpers. They use the portable `.tools/spacetime/spacetimedb-cli.exe` if present, otherwise a globally installed `spacetime` command. Database files and local CLI identity remain in ignored `.tools/` folders. **Keep this folder to retain local worlds and publisher ownership.**

On other platforms, from the repository root:

```sh
npm ci --prefix spacetime
npm ci --prefix apps/web
spacetime start --listen-addr 127.0.0.1:3001 --data-dir .tools/data --non-interactive
# In another terminal:
spacetime publish earthshare-game --module-path spacetime --server http://127.0.0.1:3001 --delete-data=never --no-config
spacetime generate --lang typescript --out-dir apps/web/src/module_bindings --module-path spacetime
npm run dev
```

A first local publish may prompt for authentication; keep using the same publisher identity for updates. `--delete-data=never` refuses destructive migrations. If the name is already owned by another identity, choose an unused name and set the frontend database variable accordingly.

## Publish to Maincloud

1. Install the official CLI, then run `spacetime login` yourself and finish its browser authentication.
2. Pick an available database name that you own. Publish from the repository root:

```sh
spacetime publish YOUR-DATABASE-NAME --module-path spacetime --server maincloud --delete-data=never --no-config
```

3. Copy `apps/web/.env.example` to `apps/web/.env.local`, and set:

```dotenv
NEXT_PUBLIC_SPACETIME_URI=wss://maincloud.spacetimedb.com
NEXT_PUBLIC_SPACETIME_DATABASE=YOUR-DATABASE-NAME
```

4. Restart the dev server, or rebuild the hosted frontend with these same public variables. Create a multiplayer room and join from another browser profile or device. Both players should see the same room revision.

Use `--no-config` with an explicit server when publishing to cloud because the committed `spacetime.json` intentionally points at local development. If your provider gives a different WebSocket endpoint, use that endpoint. Account quotas, database-name availability, and cloud permissions are verified during your publish.

## Identities and reconnecting

Browser identity tokens are scoped to the configured server and database and saved in local storage. They prove seat ownership to reducers. Clearing browser storage loses that identity; export a practice save if you want an editable offline copy. Online worlds remain in SpacetimeDB and reconnect requires the original identity. A room code permits joining an open seat but does not grant control of already claimed civilizations.

Online room tables are currently public. Room codes are convenience lobby codes, not confidentiality boundaries. There are no emails, chat, payment information, or real-world personal profiles in the schema. Private forecasts and full anti-cheat isolation need per-player views before a competitive public release.

## Current limits

Joining is available only during the first planning phase; locking all current seats starts the game with bots in unclaimed seats. The host advances shared phases. Host migration, disconnected-player timeouts, cleanup/expiry of rooms, and trade offers requiring acceptance are pending. Keep all human participants connected during a demo. Quiz clocks are measured by the database; replayed answers and actions by another civilization are rejected.

## References

[TypeScript quickstart](https://spacetimedb.com/docs/quickstarts/typescript/) · [Publishing modules](https://spacetimedb.com/docs/databases/building-publishing/) · [CLI reference](https://spacetimedb.com/docs/cli-reference/) · [Project configuration](https://spacetimedb.com/docs/cli-reference/spacetime-json/)
