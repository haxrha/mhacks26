# Optional hosting

The supported local setup is in the root README; Maincloud setup is in docs/SPACETIMEDB.md. This folder retains the repository's optional AWS/Caddy self-hosting path, adapted for the native TypeScript module. No Flask or AI orchestrator runs in this stack.

```sh
cd infra
GAME_HOST=your.domain docker compose up -d caddy spacetimedb
# Wait until the server is listening, then publish:
docker compose run --rm --build publisher
```

The publisher image supplies Node.js and the pinned official SpacetimeDB CLI for bundling TypeScript. The module imports shared rules and JSON from the repository. Persistent volumes hold database state and publisher identity, so later publishes retain ownership. Publishing refuses destructive migrations. The publisher image targets x86_64 Linux, matching the existing EC2 template.

Set the hosted frontend's `NEXT_PUBLIC_SPACETIME_URI` to `wss://your.domain` and `NEXT_PUBLIC_SPACETIME_DATABASE` to `earthshare-game`, then rebuild. Caddy handles HTTPS/WebSocket forwarding. The backend container exposes port 3000 only within the Compose network.

Docker and AWS deployment have not been executed in this Windows environment. Validate the release image tag, publisher image, volume persistence, TLS, IAM/SSM configuration and two-device gameplay on your chosen host before enabling deployment. The existing CloudFormation template and GitHub workflow are optional scaffolding; deploying them may create billable resources.
