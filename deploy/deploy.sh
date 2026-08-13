#!/usr/bin/env bash
# RailGaadi — pull latest code, rebuild, restart. Run on the EC2 server
# whenever you push a new commit to GitHub.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[ -f .env ] || { echo "No .env found — run ./deploy/setup.sh first."; exit 1; }

DC() { if docker info >/dev/null 2>&1; then docker compose "$@"; else sudo docker compose "$@"; fi; }

echo "Pulling latest code…"
git pull --ff-only

echo "Rebuilding + restarting…"
DC -f deploy/docker-compose.prod.yml up -d --build

if docker info >/dev/null 2>&1; then
  docker image prune -f >/dev/null 2>&1 || true
else
  sudo docker image prune -f >/dev/null 2>&1 || true
fi

DC -f deploy/docker-compose.prod.yml ps
echo "Deployed. Logs: docker compose -f deploy/docker-compose.prod.yml logs -f"
