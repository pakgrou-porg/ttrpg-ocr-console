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
| **Oversee the Scribes** | Ingestion job monitoring and management |
| **Divination & Omens** | Telemetry, cost tracking, and usage analytics |
| **Arcane Mechanisms** | System configuration (providers, model assignments, DB connections) |
| **The Artificers** | LLM provider management with test-connection and model discovery |
| **Summoning Rituals** | Ingestion job creation and pipeline triggering |
| **Incantations & Runes** | System prompt management for all pipeline stages |
| **Archivist's Desk** | HITL (Human-in-the-Loop) review queue for low-confidence OCR pages |
| **The Conclave** | Admin panel — user management, roles, invitations |

---

## Architecture

```
client/          React 19 + Tailwind 4 + shadcn/ui
server/          Express 4 + tRPC 11 + Drizzle ORM
drizzle/         MySQL schema + migrations
server/_core/    Auth, OAuth, LLM, S3, crypto helpers
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
- MySQL-compatible database (TiDB or MySQL 8)

### Setup

```bash
# Install dependencies
pnpm install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Push schema to database
pnpm db:push

# Start development server
pnpm dev
```

### Environment Variables

See `.env.example` for the full list. The critical ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Session cookie signing secret (min 32 chars) |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for stored API keys (min 32 chars, different from JWT_SECRET) |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side) |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL |

---

## Pipeline Integration

The Python OCR pipeline communicates with the console via tRPC HTTP endpoints. All pipeline calls require a valid session cookie (use the `SCHEDULED_TASK_COOKIE` environment variable in scheduled task contexts).

### Register a Page (after PDF-to-PNG conversion)

```bash
curl -X POST https://your-console.manus.space/api/trpc/pipeline.ingestPage \
  -H "Content-Type: application/json" \
  -H "Cookie: app_session_id=$SCHEDULED_TASK_COOKIE" \
  -d '{
    "json": {
      "documentId": 42,
      "pageNumber": 1,
      "imageUrl": "https://s3.example.com/pages/doc42-p001.png",
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
      "pass1Model": "llava-1.6",
      "pass2Model": "anthropic/claude-3.5-sonnet",
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
| `llm_providers` | Cloud/local LLM provider configs (encrypted API keys) |
| `model_assignments` | Maps pipeline stages to specific providers/models |
| `db_connections` | External database connection configs |
| `system_prompts` | Versioned prompts for all pipeline stages |
| `ingestion_jobs` | PDF ingestion job tracking |
| `telemetry_events` | Pipeline cost and usage events |
| `documents` | Source PDF metadata with ownership |
| `document_pages` | Per-page image URLs and OCR status |
| `ocr_results` | Extracted text + structured data per page |
| `hitl_queue` | Pages flagged for human review |

---

## Development

```bash
pnpm dev          # Start dev server (port 3000)
pnpm test         # Run all vitest tests
pnpm db:push      # Generate + apply schema migrations
pnpm build        # Production build
```

### Test Coverage

96 tests across:
- Auth (logout, session handling)
- Provider CRUD + test connection + model discovery
- Model assignments
- DB connections
- Library browsing (documents, pages, OCR results)
- HITL queue management
- Pipeline ingestion procedures

---

## Deployment

This project is designed for deployment on the Manus platform. Click the **Publish** button in the Management UI after creating a checkpoint. Custom domains can be configured in Settings > Domains.

For external deployments, ensure all environment variables from `.env.example` are set in your hosting environment.

---

## Security Notes

- Never commit `.env` files — use the platform's secrets management
- `CREDENTIAL_ENCRYPTION_KEY` must be different from `JWT_SECRET`
- Rotate `CREDENTIAL_ENCRYPTION_KEY` with care — existing encrypted secrets will need re-encryption
- The `/api/upload/document` endpoint validates PDF magic bytes (`%PDF-`) before processing
- All admin-only operations require `role = 'admin'` in the `users` table
