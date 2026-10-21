#!/usr/bin/env bash
set -euo pipefail
cd /workspace/Lost-Atlas
npm ci --cache /tmp/lost-atlas-npm --no-audit --no-fund
if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
fi
docker compose up -d --wait
if ! docker compose exec -T db psql -U atlas -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='lost_atlas_test'" | rg -q '^1$'; then
  docker compose exec -T db createdb -U atlas lost_atlas_test
fi
PG_CONTAINER="$(docker compose ps -q db)" npm test
npm run build
