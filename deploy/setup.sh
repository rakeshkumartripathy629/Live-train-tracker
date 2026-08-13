#!/usr/bin/env bash
# RailGaadi — one-shot EC2 setup: installs Docker, validates .env, builds &
# starts the production stack (backend + frontend + nginx). Idempotent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say() { printf '\n\033[1;34m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

DC() { if docker info >/dev/null 2>&1; then docker compose "$@"; else sudo docker compose "$@"; fi; }

# ── 1. Docker Engine + Compose plugin ─────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker Engine + Compose plugin (needs sudo)…"
  curl -fsSL https://get.docker.com | sudo sh
fi
docker compose version >/dev/null 2>&1 \
  || die "Docker Compose plugin is missing (run: sudo apt-get install docker-compose-plugin)."

# ── 2. .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp deploy/.env.production.example .env
  say "Created .env from the example template. Fill in these values, then run ./deploy/setup.sh again:"
  echo "  PUBLIC_IP, MONGODB_URI, RAILRADAR_API_KEY,"
  echo "  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, OPENWEATHER_API_KEY,"
  echo "  OPENTOPOGRAPHY_API_KEY, NEXT_PUBLIC_MAPTILER_API_KEY"
  exit 1
fi

# ── 3. Auto-fill derived values + tokens ──────────────────────────────
PUBLIC_IP="$(grep -E '^PUBLIC_IP=' .env | head -1 | cut -d= -f2- | tr -d '"')"
[ -n "$PUBLIC_IP" ] || die "PUBLIC_IP is missing in .env"
[ "$PUBLIC_IP" != "CHANGE_ME" ] || die "Set PUBLIC_IP=<your EC2 public IP or domain> in .env first."

sed -i -E "s#^NEXTAUTH_URL=http://CHANGE_ME#NEXTAUTH_URL=http://${PUBLIC_IP}#" .env
sed -i -E "s#^NEXT_PUBLIC_API_URL=http://CHANGE_ME#NEXT_PUBLIC_API_URL=http://${PUBLIC_IP}#" .env
sed -i -E "s#^CORS_ORIGINS=http://CHANGE_ME#CORS_ORIGINS=http://${PUBLIC_IP}#" .env

if grep -Eq '^NEXTAUTH_SECRET=$' .env; then
  sed -i "s/^NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$(openssl rand -hex 32)/" .env
  say "Generated NEXTAUTH_SECRET."
fi
if grep -Eq '^INTERNAL_API_TOKEN=$' .env; then
  sed -i "s/^INTERNAL_API_TOKEN=.*/INTERNAL_API_TOKEN=$(openssl rand -hex 32)/" .env
  say "Generated INTERNAL_API_TOKEN."
fi

if grep -q 'CHANGE_ME' .env; then
  die "Unfilled values remain in .env (lines: $(grep -n CHANGE_ME .env | cut -d: -f1 | paste -sd, -)). Edit .env, then re-run."
fi

say ".env is ready (PUBLIC_IP=$PUBLIC_IP)."

# ── 4. Build & start ───────────────────────────────────────────────────
say "Building images (first build takes a few minutes)…"
DC -f deploy/docker-compose.prod.yml up -d --build

say "Stack is up:"
DC -f deploy/docker-compose.prod.yml ps

say "Done. Health checks:"
say "  curl -I http://${PUBLIC_IP}/            (frontend)"
say "  curl  http://${PUBLIC_IP}/api/v1/stations/BAM   (backend via nginx)"
say "Logs: $([ "${DC}" = "docker compose" ] && echo docker || echo sudo docker) compose -f deploy/docker-compose.prod.yml logs -f"
