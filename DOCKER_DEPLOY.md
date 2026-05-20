# Docker Deployment

This console connects to a local Supabase stack. The application does not bundle its own database container. Deploy Supabase first, then deploy the console on the same Docker network or point `DATABASE_URL` at the Supabase PostgreSQL host.

## Required Services

| Service | Purpose |
| --- | --- |
| Supabase PostgreSQL | Primary application database used by Drizzle migrations |
| Supabase Kong/API | Optional REST/Auth/Storage endpoint registration in the console |
| TTRPG OCR Console | Web UI, pipeline API, HITL review, and OCR orchestration |
| Local OCR host | OpenAI-compatible local endpoint for Nemotron 3 Nano Omni or another local model |

## Minimal `.env`

```bash
NODE_ENV=production
PORT=3000
BASE_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:change_me@supabase-db:5432/postgres?sslmode=disable
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_ANON_KEY=change_me
SUPABASE_SERVICE_KEY=change_me

JWT_SECRET=change_me_generate_at_least_32_random_bytes
CREDENTIAL_ENCRYPTION_KEY=change_me_32_byte_base64_or_hex_key
SCHEDULED_TASK_COOKIE=change_me_random_session_secret

PIPELINE_WORKSPACE=/app/workspace
PIPELINE_CONFIG=/app/pipeline-config.yaml
```

## Network Layout

Use one of these patterns:

1. Attach the console container to the same Docker network as Supabase and use `supabase-db:5432` plus `supabase-kong:8000`.
2. Publish Supabase PostgreSQL on the host and set `DATABASE_URL=postgresql://postgres:<password>@host.docker.internal:5432/postgres?sslmode=disable`.

The supplied `docker-compose.yml` and `portainer-stack.yml` are configured for the shared-network pattern.

## Deploy With Docker Compose

```bash
cp env.example .env
docker compose pull
docker compose up -d --build
docker compose logs -f console
```

The container runs `node scripts/migrate.mjs` before starting the server. Migrations are idempotent.

## Portainer

Deploy the Supabase stack first. Then deploy `portainer-stack.yml` with the same external network name used by Supabase. Required variables are documented at the bottom of `portainer-stack.yml`.

## Health Check

The container health check calls:

```text
http://localhost:3000/api/trpc/health.ping
```

That endpoint is intentionally public and returns only liveness.

## Backup and Restore

Back up the Supabase PostgreSQL database with `pg_dump` or the Supabase backup tooling used for the local stack.

```bash
pg_dump "$DATABASE_URL" > ttrpg_ocr_backup.sql
psql "$DATABASE_URL" < ttrpg_ocr_backup.sql
```

Back up `PIPELINE_WORKSPACE` separately. It contains generated page images and pipeline artifacts used by HITL review.

## OCR Provider Routing

Configure stages in The Assignments:

1. Primary provider: local Nemotron 3 Nano Omni or another local OpenAI-compatible endpoint.
2. Secondary provider: another local model/profile for retry and variance reduction.
3. Cloud fallback provider: Qwen3.6 Super or another cloud model, called only after primary and secondary fail or return invalid stage output.
