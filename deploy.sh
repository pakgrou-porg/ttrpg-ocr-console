#!/usr/bin/env bash
set -euo pipefail

info() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

if ! command -v docker >/dev/null 2>&1; then
  die "docker is required"
fi

if ! docker compose version >/dev/null 2>&1; then
  die "docker compose is required"
fi

if [ ! -f .env ]; then
  die ".env not found. Copy env.example to .env and configure the Supabase connection."
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"

case "$DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *) die "DATABASE_URL must be a PostgreSQL/Supabase connection string" ;;
esac

if [ -n "${GIT_PULL:-}" ]; then
  info "Pulling latest source..."
  git pull --ff-only
fi

info "Building and starting console..."
docker compose up -d --build console

info "Checking health endpoint..."
timeout="${DEPLOY_HEALTH_TIMEOUT:-90}"
deadline=$((SECONDS + timeout))
url="http://localhost:${HOST_PORT:-3000}/api/trpc/health.ping"
until curl -fsS "$url" >/dev/null 2>&1; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    docker compose ps
    die "console did not become healthy within ${timeout}s"
  fi
  sleep 3
done

info "Deployment complete."
info "Console: http://localhost:${HOST_PORT:-3000}"
info "Logs: docker compose logs -f console"
