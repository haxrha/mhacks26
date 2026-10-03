#!/bin/bash
# Runs ON the EC2 instance: first boot (from user-data) and on every GitHub Actions deploy (via SSM).
# Pulls main, writes .env from SSM Parameter Store, (re)starts the stack, publishes the SpacetimeDB module.
set -euo pipefail
cd /opt/game
git fetch --quiet origin main
git reset --hard origin/main

source infra/.host   # GAME_HOST, AWS_REGION (written once by user-data)

# Secrets live in SSM, never in git. Missing key => orchestrator runs rule-engine-only AI.
ANTHROPIC_API_KEY=$(aws ssm get-parameter --region "$AWS_REGION" --name /mhacks26/anthropic_api_key \
  --with-decryption --query Parameter.Value --output text 2>/dev/null || true)

cat > infra/.env <<EOF
GAME_HOST=$GAME_HOST
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
EOF
chmod 600 infra/.env

cd infra
# Only bring up services whose code exists yet (apps/orchestrator is added later in the build order).
SERVICES="caddy spacetimedb"
[ -f ../apps/orchestrator/Dockerfile ] && SERVICES="$SERVICES orchestrator"
docker compose --env-file .env up -d --build --remove-orphans $SERVICES

# Publish the game module into the running SpacetimeDB (once the module exists).
if [ -d ../spacetime ]; then
  docker compose --env-file .env run --rm publisher
fi

docker compose ps
