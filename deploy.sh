#!/usr/bin/env bash
# =============================================================================
# deploy.sh — TTRPG OCR Console deployment helper
# =============================================================================
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --env FILE       Path to the .env file (default: .env in the same directory)
#   --skip-pull      Do not pull the latest image / rebuild from source
#   --skip-migrate   Do not run database migrations
#   --down           Stop and remove containers (does NOT delete volumes)
#   --reset-db       Stop containers AND delete the db_data volume (DESTRUCTIVE)
#   --help           Show this help
#
# What this script does:
#   1. Validates that required env vars are set in .env
#   2. Pulls the latest code from Git (unless --skip-pull)
#   3. Starts (or restarts) the MySQL container and waits for it to be healthy
#   4. Checks whether any Drizzle migrations are pending
#   5. Runs pending migrations inside a temporary Node container
#   6. Rebuilds and restarts the console container
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
SKIP_PULL=false
SKIP_MIGRATE=false
DO_DOWN=false
RESET_DB=false

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()  { echo -e "${CYAN}[INFO]${RESET}  $*"; }
ok()    { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
die()   { error "$*"; exit 1; }

# ── Argument parsing ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)        ENV_FILE="$2"; shift 2 ;;
    --skip-pull)  SKIP_PULL=true; shift ;;
    --skip-migrate) SKIP_MIGRATE=true; shift ;;
    --down)       DO_DOWN=true; shift ;;
    --reset-db)   RESET_DB=true; shift ;;
    --help)
      sed -n '/^# Usage:/,/^# ====/p' "$0" | sed 's/^# \?//'
      exit 0 ;;
    *) die "Unknown option: $1. Run with --help for usage." ;;
  esac
done

# ── Prerequisites ──────────────────────────────────────────────────────────
for cmd in docker git node; do
  command -v "$cmd" &>/dev/null || die "'$cmd' is not installed or not on PATH."
done
docker compose version &>/dev/null || die "'docker compose' (v2 plugin) is required."

# ── Load .env ──────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  die ".env file not found at: $ENV_FILE\n  Copy env.example to .env and fill in your values."
fi
info "Loading environment from: $ENV_FILE"
# Export vars from .env (skip comments and blank lines)
set -o allexport
# shellcheck disable=SC1090
source "$ENV_FILE"
set +o allexport

# ── Validate required vars ─────────────────────────────────────────────────
REQUIRED_VARS=(JWT_SECRET MYSQL_ROOT_PASSWORD MYSQL_DATABASE MYSQL_USER MYSQL_PASSWORD)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    MISSING+=("$var")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  die "The following required variables are not set in $ENV_FILE:\n  ${MISSING[*]}\n\nSee env.example for descriptions."
fi

# Warn about placeholder values
for var in JWT_SECRET CREDENTIAL_ENCRYPTION_KEY; do
  val="${!var:-}"
  if [[ "$val" == *"REPLACE_WITH"* ]]; then
    warn "$var still contains a placeholder value. Generate a real secret with:\n  openssl rand -base64 32"
  fi
done

# ── --down / --reset-db ────────────────────────────────────────────────────
if $DO_DOWN; then
  info "Stopping and removing containers..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
  ok "Containers stopped."
  exit 0
fi

if $RESET_DB; then
  warn "DESTRUCTIVE: this will delete the db_data volume and all database contents."
  read -rp "  Type 'yes' to confirm: " CONFIRM
  [[ "$CONFIRM" == "yes" ]] || die "Aborted."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down -v
  ok "Containers and db_data volume removed."
  exit 0
fi

# ── Pull latest code ───────────────────────────────────────────────────────
if ! $SKIP_PULL; then
  info "Pulling latest code from Git..."
  cd "$SCRIPT_DIR"
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git pull origin "$BRANCH" || warn "git pull failed — continuing with local code."
  ok "Code is up to date (branch: $BRANCH)."
fi

# ── Start the database container ───────────────────────────────────────────
info "Starting MySQL container..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db

# Wait for the DB health check to pass (up to 60 s)
info "Waiting for MySQL to become healthy..."
TIMEOUT=60
ELAPSED=0
while true; do
  STATUS=$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --format json db 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Health','unknown'))" 2>/dev/null \
    || echo "unknown")
  if [[ "$STATUS" == "healthy" ]]; then
    ok "MySQL is healthy."
    break
  fi
  if [[ $ELAPSED -ge $TIMEOUT ]]; then
    die "MySQL did not become healthy within ${TIMEOUT}s. Check logs:\n  docker compose logs db"
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  echo -n "."
done

# ── Check and run Drizzle migrations ──────────────────────────────────────
if ! $SKIP_MIGRATE; then
  info "Checking for pending database migrations..."

  # Build DATABASE_URL from components if not explicitly set
  DB_URL="${DATABASE_URL:-}"
  if [[ -z "$DB_URL" ]]; then
    DB_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${HOST_PORT:-3306}/${MYSQL_DATABASE}"
    # When running on the host (not inside Docker), the MySQL container port
    # is mapped to the host. Default MySQL port is 3306.
    # Adjust HOST_MYSQL_PORT in .env if you changed the mapping.
    DB_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:${HOST_MYSQL_PORT:-3306}/${MYSQL_DATABASE}"
  fi

  cd "$SCRIPT_DIR"

  # Check if pnpm is available for running migrations from the host
  if command -v pnpm &>/dev/null; then
    info "Running migrations via pnpm db:push (host Node.js)..."
    DATABASE_URL="$DB_URL" pnpm db:push && ok "Migrations applied." \
      || warn "pnpm db:push reported an issue — check output above."
  else
    # Fallback: run migrations inside a temporary container that shares the
    # project source and connects to the db container over the Docker network.
    info "pnpm not found on host — running migrations inside a temporary container..."
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm \
      -e DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}" \
      --entrypoint "" \
      console \
      sh -c "npm install -g pnpm@10 --silent && pnpm db:push" \
      && ok "Migrations applied." \
      || warn "Migration step reported an issue — check output above."
  fi
else
  warn "Skipping migrations (--skip-migrate)."
fi

# ── Build and start the console ────────────────────────────────────────────
info "Building and starting the console container..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build console

ok "Deployment complete!"
echo ""
echo -e "${BOLD}Console URL:${RESET} http://localhost:${HOST_PORT:-3000}"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f console   # tail console logs"
echo "  docker compose logs -f db        # tail MySQL logs"
echo "  docker compose ps                # check container status"
echo "  ./deploy.sh --down               # stop containers"
echo "  ./deploy.sh --reset-db           # stop + wipe database (DESTRUCTIVE)"
