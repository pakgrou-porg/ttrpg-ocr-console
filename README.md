# TTRPG OCR Console

A production-ready web console for managing an end-to-end OCR pipeline that converts TTRPG (Tabletop Role-Playing Game) PDF materials into structured JSON data. Built on React 19 + Tailwind 4 + Express 4 + tRPC 11.

---

## Overview

The console provides a human-facing interface for every stage of the pipeline:

| Console Name | Purpose |
|---|---|
| **Grand Hall** | System health dashboard — DB, agents, cloud conduit status |
| **Enter the Arkanum** | Browse extracted lore; Library Shelves for raw image + OCR comparison |
| **Listen to Ramblings** | LLM-powered lore generation from the extracted dataset |
| **Tome of Knowledge** | Pipeline documentation and integration reference |
| **Divination & Omens** | Telemetry, cost tracking, and usage analytics |
| **Archivist's Desk** | HITL review queue — low-confidence pages auto-flagged for re-check |
| **Oversee the Scribes** | Ingestion job monitoring with per-page progress and LLM timing |
| **Arcane Mechanisms** | System configuration (providers, stage inscriptions, DB connections) |
| **Summoning Rituals** | PDF upload and ingestion job creation |
| **Trials of Truth** | Admin: per-item HITL review with bbox overlay and one-click retry |
| **Incantations & Runes** | System prompt management with version history for all pipeline stages |
| **The Artificers** | Admin: LLM provider registry with test-connection and model discovery |
| **The Assignments** | Admin: stage inscription management — provider, fallback, temperature, max tokens |
| **The Vault Nexus** | Admin: external database connection management |
| **The Conclave** | Admin: user management, roles, and invitations |

---

## Architecture

```
client/          React 19 + Tailwind 4 + shadcn/ui
server/          Express 4 + tRPC 11 + Drizzle ORM
drizzle/         PostgreSQL schema + migrations
server/_core/    Auth, OAuth, LLM, S3, crypto helpers
server/pipeline/ Internal OCR pipeline runner (runner.ts, invoke.ts, stages)
```

### Key Security Properties

- **AES-256-GCM** encryption for all stored API keys and credentials
- **Separate encryption key** (`CREDENTIAL_ENCRYPTION_KEY`) distinct from the session signing key (`JWT_SECRET`)
- **Secret display hints** (`keyPrefix`, `keySuffix`, `keyLength`) stored at write time — list views never decrypt secrets
- **Auth before Multer** — upload endpoint authenticates before parsing the request body
- **PDF magic-byte validation** — rejects non-PDF files even if the extension is `.pdf`
- **Prompt mutations are admin-only** — prevents users from injecting malicious instructions into the OCR pipeline
- **Telemetry writes are admin-only** — prevents event flooding
- **Health endpoint split** — `/health.ping` is public (liveness probe); `/health.database` and `/health.all` require authentication
- **1 MB global body limit** — file uploads use their own multer limits (10 MB PDF cap)

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm
- PostgreSQL 15+

### Setup

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Apply pending schema migrations
node migrate.mjs

# Start development server
pnpm dev
```

### Environment Variables

See `.env.example` for the full list. The critical ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (`postgres://user:pass@host/db`) |
| `JWT_SECRET` | Session cookie signing secret (min 32 chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for stored API keys (min 32 chars, different from JWT_SECRET) |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side) |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL |

---

## Pipeline Integration

The OCR pipeline runs internally as a Node.js process (`server/pipeline/runner.ts`). Jobs are triggered from the console UI (Summoning Rituals) or via the `pipeline.triggerJob` tRPC procedure. The runner processes each page through the full stage sequence — layout analysis, bbox detection, OCR extraction, quality validation, and structured assembly — invoking LLMs via the configured stage inscriptions.

The tRPC pipeline endpoints (`pipeline.ingestPage`, `pipeline.submitOcrResult`, `pipeline.flagPage`) remain available for external callers. All pipeline calls require a valid session cookie (use the `SCHEDULED_TASK_COOKIE` environment variable in scheduled task contexts).

### Pipeline Flow

```mermaid
flowchart TD
    A([PDF Upload]) --> B[pdf_to_png\nConvert to page images]
    B --> C[pdf_text_extract\nNative text · hasEmbeddedText]
    B --> D[document_intelligence\nDoc type · title · summary]

    D --> E[layout_analysis]
    D --> F[bbox_detection]
    D --> G[content_type_classify]

    C -. "F1 baseline" .-> H

    E --> H[ocr_extraction\nnormalisedText · nativeSimilarity]
    F --> H
    G --> H

    H --> I[content_break_detect]
    H -->|table pages| J[tabular_extraction]

    I --> K{quality check}
    J --> K

    K -->|pass| L[artifact_storage]
    K -->|low conf / divergence| O([HITL Queue])
    K -->|fail| M[pass3 — cloud retry]
    M -->|pass| L
    M -->|fail| N[pass4 — cloud retry]
    N -->|pass| L
    N -->|irrecoverable| O

    L --> P[embedding_generation]
    P --> Q[(Database)]
    Q --> R([Voice of Arkanum])
    Q --> S([The Referee])
```

An interactive version of this diagram — with live provider assignments, fallback chains, and per-stage inscription details — is available at **Oversee the Scribes** in the admin console.

### Provider & Stage Configuration

Before running the pipeline, configure providers and stage inscriptions:

1. **The Artificers** — add one row per LLM provider instance. Paste a full URL (e.g. `http://10.0.0.1:1234/v1`) into Base URL and it auto-decomposes into host, port, and API prefix. Click **Discover Models** to fetch the model list from the provider and auto-fill `contextLength` and `maxTokens`. Use the **Vision only** toggle to filter to vision-capable models for OCR stages.
2. **The Assignments** — inscribe each pipeline stage with a primary provider and optional fallback. Each inscription references a named system prompt from Incantations & Runes and carries its own `temperature` and `maxTokens` overrides independent of the provider defaults.

### Register a Page (after PDF-to-PNG conversion)

```bash
curl -X POST https://your-console.manus.space/api/trpc/pipeline.ingestPage \
  -H "Content-Type: application/json" \
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
  -d '{
    "json": {
      "documentId": 42,
      "pageNumber": 1,
      "rawPngUrl": "https://s3.example.com/pages/doc42-p001.png",
      "preprocessedPngUrl": "https://s3.example.com/pages/doc42-p001-binarized.png",
      "thumbnailUrl": "https://s3.example.com/thumbs/doc42-p001-thumb.png",
      "phash": "a1b2c3d4e5f6a7b8",
      "isBinarized": true,
      "imageWidth": 2480,
      "imageHeight": 3508
    }
  }'
```

**Response:** `{ "result": { "data": { "json": { "success": true, "pageId": 123, "isDuplicate": false } } } }`

If `isDuplicate` is `true`, the response also includes `"duplicateOfPageId"` — skip OCR for this page.

### Submit OCR Result (after two-pass OCR)

```bash
curl -X POST https://your-console.manus.space/api/trpc/pipeline.submitOcrResult \
  -H "Content-Type: application/json" \
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
  -d '{
    "json": {
      "pageId": 123,
      "rawText": "The dragon breathes fire...",
      "structuredData": { "type": "monster_stat_block", "name": "Ancient Red Dragon" },
      "layoutMetadata": { "elements": [{ "type": "heading", "bbox": [0, 0, 100, 20] }] },
      "confidence": 87,
      "passNumber": 2,
      "cloudModelUsed": "anthropic/claude-3.5-sonnet",
      "auditLog": [
        { "timestamp": "2026-05-02T12:00:00Z", "action": "pass1_complete", "model": "llava-1.6" },
        { "timestamp": "2026-05-02T12:00:05Z", "action": "pass2_complete", "model": "claude-3.5-sonnet" }
      ]
    }
  }'
```

**Response:** `{ "result": { "data": { "json": { "success": true, "ocrResultId": 456, "autoFlagged": false } } } }`

If `confidence < 70`, the page is automatically flagged to the HITL queue and `"autoFlagged": true` is returned.

### Manually Flag a Page for HITL Review

```bash
curl -X POST https://your-console.manus.space/api/trpc/pipeline.flagPage \
  -H "Content-Type: application/json" \
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
  -d '{
    "json": {
      "pageId": 123,
      "reason": "Consensus disagreement between Pass 1 and Pass 2 models",
      "priority": "high",
      "flagCategory": "consensus_failure"
    }
  }'
```

### Upload a PDF Document (via console UI or pipeline)

```bash
curl -X POST https://your-console.manus.space/api/upload/document \
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
  -F "pdf=@/path/to/sourcebook.pdf" \
  -F "name=Player's Handbook 5e" \
  -F "gameSystem=D&D 5e" \
  -F "publisher=Wizards of the Coast" \
  -F "edition=5th Edition"
```

---

## Database Schema

Key tables:

| Table | Purpose |
|---|---|
| `users` | Authenticated users with role (`admin` / `user`) |
| `llm_providers` | Cloud/local LLM provider registry. Key columns: `displayName`, `modelId`, `baseUrl`, `port`, `apiPrefix`, `supportsChat`, `supportsVision`, `supportsEmbedding`, `defaultTemperature`, `contextLength`, `maxTokens`, `isDefault`, `encryptedApiKey` |
| `stage_inscriptions` | Maps each pipeline stage to a primary + fallback provider with per-stage `promptName`, `temperature`, `maxTokens`, and `llmSettings` JSON |
| `system_prompts` | Versioned prompts for all pipeline stages (referenced by `stage_inscriptions.promptName`) |
| `prompt_versions` | Version history for each system prompt (last 3 versions retained) |
| `ingestion_jobs` | PDF ingestion job tracking (phase 1/2/3 status) |
| `telemetry_events` | Pipeline cost and usage events |
| `documents` | Source PDF metadata with ownership, document type, summary, game version |
| `document_pages` | Per-page raw + preprocessed PNG URLs, layout type, content regions JSON, continuity flags, assembled page JSON output |
| `ocr_results` | Extracted text + structured data per page (pass number, attempt score, comparison notes) |
| `page_processing_attempts` | Each OCR pass (1–4) per page: model used, raw output, attempt score, comparison notes |
| `hitl_queue` | Pages flagged for human review with reason, priority, and resolution tracking |
| `llm_timing_metrics` | Per-call LLM timing and token usage (stage, provider, model, duration, tokens, job/page FK) |
| `supabase_instances` | External Supabase connection configs |

---

## Development

```bash
pnpm dev          # Start dev server (port 3000)
pnpm test         # Run all vitest tests
node migrate.mjs  # Apply pending schema migrations
pnpm build        # Production build
```

### Test Coverage

128 tests across:
- Auth (logout, session handling)
- Provider CRUD + test connection + model discovery
- Stage inscriptions (upsert, topology, primary/fallback provider)
- DB connections
- Library browsing (documents, pages, OCR results)
- HITL queue management
- Pipeline ingestion procedures
- Pipeline job management + page attempt tracking

---

## Deployment

The project ships as a Docker image built and pushed to GHCR on every push to `main` via `.github/workflows/release.yml`.

```bash
# Pull and run the latest image
docker pull ghcr.io/pakgrou-porg/ttrpg-ocr-console:latest
```

A Portainer-ready stack file is provided at `portainer-stack.yml`. The container entrypoint runs `node migrate.mjs` (applies any pending migrations) then starts the Express server.

See `DOCKER_DEPLOY.md` for the full deployment guide covering Portainer stack setup, environment variables, update/rollback, and backup procedures.

Ensure all environment variables from `.env.example` are set in your hosting environment before starting the container.

---

## Security Notes

- Never commit `.env` files — use the platform's secrets management
- `CREDENTIAL_ENCRYPTION_KEY` must be different from `JWT_SECRET`
- Rotate `CREDENTIAL_ENCRYPTION_KEY` with care — existing encrypted secrets will need re-encryption
- The `/api/upload/document` endpoint validates PDF magic bytes (`%PDF-`) before processing
- All admin-only operations require `role = 'admin'` in the `users` table
