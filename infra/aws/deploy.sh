#!/bin/bash
# Runs ON the EC2 instance: first boot (from user-data) and on every GitHub Actions deploy (via SSM).
# Pulls main, writes the host .env, (re)starts the stack, publishes the SpacetimeDB module.
set -euo pipefail
cd /opt/game
git fetch --quiet origin main
git reset --hard origin/main

source infra/.host   # GAME_HOST, AWS_REGION (written once by user-data)

cat > infra/.env <<EOF
GAME_HOST=$GAME_HOST
EOF
chmod 600 infra/.env

cd infra
docker compose --env-file .env up -d --build --remove-orphans caddy spacetimedb
# Give a newly started native server time to bind before publishing.
for attempt in $(seq 1 30); do
  if docker compose exec -T spacetimedb spacetime version >/dev/null 2>&1; then break; fi
  sleep 1
done
# Publish the game module into the running SpacetimeDB (once the module exists).
if [ -d ../spacetime ]; then
  docker compose --env-file .env run --rm --build publisher
fi

docker compose ps
