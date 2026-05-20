# TTRPG OCR Console — Project Context

> **Read this file first.** Every model session working on this project should load this file before touching any other file. It is the cross-cutting vocabulary that prevents type mismatches, duplicate work, and incorrect assumptions.
>
> **Maintenance rule:** Update this file whenever a new table is added, a router namespace is added or renamed, a new environment variable is introduced, a known issue is resolved, or the pipeline stage list changes.

---

## 1. Domain Vocabulary

The project uses deliberate thematic names for every UI section. Code, comments, and communication must use these names consistently.

| UI Name | Technical Concept | Primary Route |
|---|---|---|
| Enter the Arkanum | Document library browser (read-only) | `/enter-arkanum` |
| Listen to Ramblings | Advanced search / RAG query interface | `/listen-ramblings` |
| Oversee the Scribes | Job monitor (`ingestion_jobs`, `page_processing_attempts`) | `/oversee-scribes` |
| Archivist's Desk | HITL review queue (`hitl_queue`) | `/archivists-desk` |
| Tome of Knowledge | Game system registry (`game_systems`) | `/tome-knowledge` |
| Incantations & Runes | System prompt template management (`prompts`) | `/incantations-runes` |
| Arcane Mechanisms | Service config + health dashboard | `/arcane-mechanisms` |
| Summoning Rituals | Document upload / ingest | `/summoning-rituals` |
| The Artificers | LLM provider management (`llm_providers`) | `/the-artificers` |
| The Assignments | Stage-to-provider mapping (`stage_inscriptions`) | `/the-assignments` |
| The Vault Nexus | Supabase connection registry (`supabase_instances`) | `/the-vault-nexus` |
| The Conclave | Admin panel (users, invitations, roles) | `/the-conclave` |
| Personal Sanctum | User profile + prompt templates | `/personal-sanctum` |
| Trials of Truth | Per-stage retry + fine-tuning export | `/trials-of-truth` |
| The Chronicles | Prompt version history + diff view | `/the-chronicles` |
| Divination & Omens | Telemetry / analytics | `/divination-omens` |

---

## 2. Database Schema

### Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `users` | Auth, roles, owner bootstrap | `openId`, `role` (`admin`\|`user`), `email`, `name` |
| `documents` | Top-level TTRPG document record | `filename`, `documentStatus`, `gameSystem`, `ownerUserId`, `visibility` |
| `document_pages` | One row per PDF page | `pageNumber`, `rawPngUrl`, `preprocessedPngUrl`, `phash`, `wasPreprocessed`, `preprocessingApplied`, `layoutType`, `contentRegions` |
| `ocr_results` | OCR output per page | `structuredData`, `rawText`, `markdownText`, `confidence`, `pass1Model`, `correctedText`, `correctedStructuredData` |
| `page_processing_attempts` | Per-stage audit log | `stage`, `status`, `modelUsed`, `latencyMs`, `errorMessage`, `responseTokens` |
| `hitl_queue` | Human review queue | `pageId`, `status`, `priority`, `reason`, `flagCategory`, `resolvedBy` |
| `ingestion_jobs` | Top-level job tracker | `status`, `totalPages`, `processedPages`, `currentPhase`, `errorMessage` |
| `llm_providers` | LLM provider credentials | `name`, `type`, `baseUrl`, `encryptedApiKey`, `modelId`, `isActive` |
| `stage_inscriptions` | Stage → provider mapping | `stage`, `primaryProviderId`, `fallbackProviderId`, `systemPrompt`, `temperature`, `maxTokens`, `llmSettings` |
| `supabase_instances` | Supabase connection registry | `connectionType`, `role`, `syncMode`, `encryptedServiceKey`, `bootstrapStatus` |
| `system_config` | Key-value config store | `key`, `value`, `category` |
| `prompts` | System prompt templates with versioning | `name`, `content`, `category`, `version`, `isActive` |
| `llm_timing_metrics` | Per-call timing telemetry | `stage`, `providerId`, `latencyMs`, `inputTokens`, `outputTokens` |
| `content_summaries` | Hierarchical RAG summaries | `documentId`, `level`, `status`, `embeddingStatus`, `vectorId` |
| `game_systems` | TTRPG game system registry | `name`, `abbreviation`, `publisher` |

### Enums and Constants (defined in `drizzle/schema.ts`)

```ts
DOCUMENT_TYPES    = ["book", "guide", "periodical", "magazine", "supplement", "adventure", "unknown"]
DOCUMENT_STATUSES = ["pending", "processing", "completed", "failed", "archived"]
LAYOUT_TYPES      = ["text", "image", "table", "mixed", "unknown"]
HITL_PRIORITIES   = ["low", "medium", "high", "critical"]
HITL_STATUSES     = ["queued", "in_progress", "resolved", "skipped", "escalated"]
HITL_FLAG_CATEGORIES = ["low_confidence", "layout_error", "missing_text", "garbled_text", "wrong_structure", "manual_flag"]
OCR_RESULT_STATUSES  = ["pending", "processing", "completed", "failed"]
SUMMARY_LEVELS    = ["chapter", "section", "subsection", "page"]
SUMMARY_STATUSES  = ["pending", "generating", "generated", "approved", "failed"]
SUPABASE_CONNECTION_TYPES = ["supabase_local", "supabase_cloud", "postgres_docker"]
SUPABASE_ROLES    = ["primary", "secondary"]
SUPABASE_SYNC_MODES = ["primary_only", "mirror", "failover"]
```

---

## 3. Pipeline Architecture

### Three-Phase Structure

**Phase 1 — Layout & Classification** (local VLM, no API cost)

```
document_registration → document_intelligence → pdf_to_png →
layout_analysis → layout_classification → bbox_detection →
content_type_classify → child_image_extraction
```

**Phase 2 — OCR & Extraction** (cloud LLMs via OpenRouter)

```
ocr_extraction → content_break_detect → summarisation →
quality_validation → pass_comparison → ocr_validation →
tabular_extraction → json_assembly → quality_assessment
```

**Phase 3 — Storage & Enrichment**

```
artifact_storage → embedding_generation → database_load
```

**Phase 0 — Standalone** (not part of the main run sequence)

```
voice_of_arkanum    referee
```

### Runtime Rules

- **Image routing:** Visual stages (Phase 1) receive the **original** PNG. Text stages (Phase 2) receive the **preprocessed** PNG when binarization is enabled (`pipeline-config.yaml: binarize.enabled: true`).
- **Concurrency:** `PAGE_LLM_SEMAPHORE` limits simultaneous LLM page calls (default: `maxLlmConcurrency: 4`).
- **HITL auto-queue:** Pages with `confidence < hitlConfidenceThreshold` (default: 80%) are automatically inserted into `hitl_queue`.
- **Provider fallback:** If the primary provider for a stage fails, the runner falls back to the secondary provider defined in `stage_inscriptions.fallbackProviderId`.
- **Preprocessing:** `preprocessPageImages()` in `runner.ts` applies grayscale + sharpen + threshold (Otsu by default) via `sharp`. Parameters are driven by `pipeline-config.yaml`.
- **Workspace:** All intermediate files (PDFs, PNGs) live in `PIPELINE_WORKSPACE` (default: `/app/workspace`). **This directory must be volume-mounted in production** or all files are lost on container restart.
- **Config file:** `pipeline-config.yaml` at the project root. Volume-mount to override without rebuilding. Re-read on server startup.

---

## 4. tRPC Router Map

All procedures are in `server/routers.ts`. Access level: **P** = protected (any logged-in user), **A** = admin only, **Pub** = public.

| Namespace | Access | Key Procedures |
|---|---|---|
| `auth` | Pub/P | `me`, `logout` |
| `health` | P | `database`, `all` (pings DB + all active providers) |
| `profile` | P | `get`, `update` |
| `permissions` | P | `mine` |
| `prompts` | P/A | `list`, `upsert` (A), `getVersions`, `revert` (A) |
| `ramblings` | P | `generate` (RAG query via LLM) |
| `config` | P | `list`, `set` |
| `jobs` | P/A | `list`, `get`, `create` (A), `cancel` (A), `stats` |
| `telemetry` | P/A | `summary`, `record` (A) |
| `admin` | A | `listUsers`, `setRole`, `listInvitations`, `createInvitation`, `featureAreas` |
| `providers` | P/A | `list`, `create` (A), `update` (A), `delete` (A), `test`, `getSecretHint` |
| `assignments` | P/A | `topology`, `upsert` (A), `delete` (A) |
| `connections` | P/A | `list`, `create` (A), `update` (A), `delete` (A), `test`, `bootstrap` (A) |
| `library` | P | `listDocuments`, `getDocument`, `getPage`, `searchDocuments`, `updateDocument` |
| `hitl` | P | `list`, `get`, `resolve`, `skip`, `escalate`, `flag`, `stats` |
| `pipeline` | P/A | `ingestPage`, `submitOcrResult`, `flagPage`, `retryStages` (A), `getPageImage` |
| `google` | P | `getAuthUrl`, `handleCallback`, `listFiles`, `importFile` |
| `metrics` | P | `jobTimings`, `providerTimings`, `pageTimings` |
| `gameSystems` | P/A | `list`, `create` (A), `update` (A), `delete` (A) |
| `summaries` | P/A | `list`, `generate` (A), `approve` (A) |

---

## 5. Critical Shape Contracts

These are the most common source of type mismatches. Verify before writing any UI code that consumes these procedures.

### `hitl.list` — sidebar list shape

```ts
{
  hitl_id: number;
  hitl_status: HitlStatus;
  hitl_reason: string;
  document: { title, publisher, type, game_system, summary };
  page: {
    number: number | null;   // ← NOTE: page.number, NOT pageNumber
    image_url: string | null;
    layout_type: string | null;
    ocr_confidence: number | null;
    model: string | null;
    extracted_at: Date | null;
  };
  regions: ContentRegion[];
  ocr_output: unknown;
  raw_text: string | null;
  human_corrections: { corrected_text, corrected_data } | null;
  // plus all HitlQueueItem fields spread at top level
}
```

> **Common mistake:** `item.pageNumber` — this field does **not** exist. Use `item.page?.number`.

### `hitl.get` — full detail shape

```ts
{
  item: HitlQueueItem;
  page: DocumentPage | null;
  document: Document | null;
  ocr: OcrResult | null;
  attempts: PageProcessingAttempt[];
}
```

### `library.getPage` — page detail shape

```ts
{
  page: DocumentPage;
  ocr: OcrResult | null;
  attempts: PageProcessingAttempt[];
}
```

### `assignments.topology` — stage topology shape

```ts
{
  stages: Array<{
    stage: PipelineStage;
    phase: 1 | 2 | 3 | 0;
    inscription: StageInscription | null;
    primaryProvider: LlmProvider | null;
    fallbackProvider: LlmProvider | null;
  }>;
}
```

---

## 6. Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string. Add `?sslmode=disable` for Docker internal networks. |
| `JWT_SECRET` | Yes | — | Session cookie signing. Minimum 32 characters. |
| `CREDENTIAL_ENCRYPTION_KEY` | Recommended | Falls back to `JWT_SECRET` | Separate AES key for encrypting provider API keys in DB. |
| `VITE_APP_ID` | Yes | — | Manus OAuth application ID. |
| `OAUTH_SERVER_URL` | Yes | `https://api.manus.im` | Manus OAuth backend URL. |
| `VITE_OAUTH_PORTAL_URL` | Yes | `https://manus.im` | Manus login portal URL (injected at runtime via `window.__RUNTIME_CONFIG__`). |
| `OWNER_OPEN_ID` | Yes | — | User auto-promoted to `admin` on first login. |
| `OWNER_NAME` | Yes | — | Display name for the owner. |
| `SUPABASE_URL` | Yes | — | Internal Kong gateway URL (e.g. `http://supabase-kong:8000`). |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anon JWT. |
| `SUPABASE_SERVICE_KEY` | Yes | — | Supabase service role JWT. |
| `GOOGLE_CLIENT_ID` | Optional | — | Google Drive OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Optional | — | Google Drive OAuth client secret. |
| `GOOGLE_API_KEY` | Optional | — | Google API key for Drive file picker. |
| `APP_URL` | Optional | `http://localhost:3000` | Canonical public URL — must match Google OAuth redirect URI. |
| `PIPELINE_WORKSPACE` | Optional | `/app/workspace` | Filesystem path for PDFs and PNGs. **Must be volume-mounted in production.** |
| `PIPELINE_CONFIG_PATH` | Optional | `/app/pipeline-config.yaml` | Override path for `pipeline-config.yaml`. |
| `BUILT_IN_FORGE_API_URL` | Optional | — | Manus built-in LLM API base URL. |
| `BUILT_IN_FORGE_API_KEY` | Optional | — | Manus built-in LLM API key (server-side). |
| `VITE_FRONTEND_FORGE_API_URL` | Optional | — | Manus built-in LLM API base URL (frontend). |
| `VITE_FRONTEND_FORGE_API_KEY` | Optional | — | Manus built-in LLM API key (frontend). |

---

## 7. Deployment Architecture

```
Host machine
├── Supabase stack (supabase_net Docker network)
│   ├── supabase-db        PostgreSQL 15 + pgvector  :5432
│   ├── supabase-kong      Kong API gateway           :8000 (internal), :8100 (host)
│   ├── supabase-auth      GoTrue auth service
│   ├── supabase-rest      PostgREST
│   └── supabase-storage   Storage API
│
└── Console stack (joins supabase_net as external network)
    └── console            Express + tRPC + Vite      :3000 (host: HOST_PORT)
        ├── node migrate.mjs      (runs on startup — applies Drizzle migrations)
        └── node dist/index.js    (Express server)
```

**Migration runner:** `migrate.mjs` uses `drizzle-orm/postgres-js/migrator` — no `drizzle-kit` required at runtime. All migration SQL files are in `drizzle/migrations/`.

**Image:** `ghcr.io/pakgrou-porg/ttrpg-ocr-console:{IMAGE_TAG}` — built by GitHub Actions on every version tag push.

---

## 8. Key File Map

```
drizzle/schema.ts          ← All tables, types, enums, PIPELINE_STAGES, STAGE_PHASES
server/db.ts               ← All query helpers (1,500+ lines — check here before writing new queries)
server/routers.ts          ← All tRPC procedures (2,300+ lines — split by namespace)
server/pipeline/runner.ts  ← Pipeline execution engine, stage functions, preprocessing
server/pipeline/invoke.ts  ← LLM provider dispatch, fetchWithRetry, buildProviderCall
server/pipeline/config.ts  ← pipeline-config.yaml loader (singleton, read at startup)
server/_core/env.ts        ← All environment variable access (single source of truth)
server/_core/crypto.ts     ← Credential encryption/decryption, storeSecretHint
server/uploadIngestRoute.ts ← POST /api/upload/ingest (multer, auth, job creation)
pipeline-config.yaml       ← Runtime pipeline tuning (DPI, concurrency, binarize params)
portainer-stack.yml        ← Production Docker Compose for Portainer
migrate.mjs                ← Standalone DB migration runner (used in Docker CMD)
client/src/pages/          ← 19 page components (see Domain Vocabulary table for mapping)
client/src/components/     ← Shared UI components (DashboardLayout, AIChatBox, Map, etc.)
```

---

## 9. Known Open Issues

> Check this list before starting any work to avoid duplicating effort or re-introducing fixed bugs.

| # | File(s) | Issue | Priority |
|---|---|---|---|
| 1 | `tsconfig.json` | Missing `"target": "ES2020"` — causes `Set`/`Map` iteration TS errors in `TrialsOfTruth.tsx`, `oauth.ts`, `routers.ts` | High |
| 2 | `ArchivistsDesk.tsx:337` | `item.pageNumber` should be `item.page?.number` — field does not exist at top level | High |
| 3 | `portainer-stack.yml` | Missing `volumes:` section for `PIPELINE_WORKSPACE` — workspace is ephemeral on container restart | High |
| 4 | `uploadIngestRoute.ts:39` | `multer` `fileFilter` callback type error — pass `null` explicitly: `if (ok) cb(null, true); else cb(new Error(...), false)` | Medium |
| 5 | `server/pipeline/runner.ts` | `Cannot find module 'sharp'` TS error — add `@types/sharp` to devDependencies | Medium |
| 6 | `routers.ts` (`hitl.get`, `library.getPage`) | `markdownText` stored in `ocr_results` but not returned by these procedures — UI cannot display it | Medium |
| 7 | `server/pipeline/runner.ts` | `preprocessPageImages()` is serial (`for...of` + `await`) — should use bounded `Promise.all` for performance | Medium |
| 8 | `server/routers.ts` | `listDocuments` / `searchDocuments` ownership filter is a JS post-filter, not a SQL `WHERE` clause — incorrect when pagination is applied | Medium |
| 9 | `server/routers.ts` | Email dispatch for invitations not implemented — invitations are created in DB but never sent | Low |
| 10 | `uploadIngestRoute.ts` | `multer.memoryStorage()` for up to 200 MB uploads — should use `diskStorage()` to avoid heap pressure | Low |
| 11 | No rate limit on `/api/upload/ingest` — unbounded concurrent uploads possible | Low |

---

## 10. Test Suite

Seven test files in `server/*.test.ts`. Run with `pnpm test`.

| File | Coverage |
|---|---|
| `auth.logout.test.ts` | Session cookie clearing |
| `admin.test.ts` | Role gates, invitation validation |
| `features.test.ts` | Health, config, jobs, telemetry, prompts, assignments topology |
| `library.test.ts` | Documents, pages, pipeline ingestion, OCR submission, HITL flagging |
| `profile.prompts.test.ts` | Prompt upsert, versioning, category filtering |
| `providers.test.ts` | Provider CRUD, secret hint shape |
| `security.test.ts` | Auth gates across all major procedures |

**Missing test coverage (high value):**
- `buildMarkdownText` unit test with fixture data
- `fetchWithRetry` — retry on network error, HTTP 429, no retry on `AbortError`
- `hitl.list` shape assertion — would catch the `item.pageNumber` bug
- `POST /api/upload/ingest` — file type rejection
- `pipeline.submitOcrResult` with `markdownText` field
