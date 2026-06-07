# TTRPG OCR Console — Project Context Reference

> **Read this file first.** Every model session working on this project should read CONTEXT.md before
> touching any other file. It is the single source of truth for vocabulary, architecture, and
> cross-cutting conventions. Update it whenever a table, router, page, env var, or known issue changes.
>
> **Current version: v0.2.29** (updated 2026-06-07)

---

## 1. Domain Vocabulary (UI Name → Technical Concept)

The application uses evocative fantasy names for every page and concept. Using the wrong name in code,
comments, or communication causes confusion. This table is the canonical mapping.

| UI / Route Name | Technical Concept | Route |
|---|---|---|
| **Enter the Arkanum** | Document library browser — read-only shelf view | `/enter-arkanum` |
| **Listen to Ramblings** | Advanced search / peruse OCR data | `/listen-ramblings` |
| **Tome of Knowledge** | Game system registry (`game_systems` table) | `/tome-knowledge` |
| **Divination Omens** | Analytics dashboard (charts, stats) | `/divination-omens` |
| **Archivist's Desk** | HITL review queue + pipeline metrics dashboard (incl. HITL category panel + Artificer Performance) | `/inner-sanctum/archivists-desk` |
| **Oversee the Scribes** | Job monitor + page browser + Retry Queue panel | `/inner-sanctum/oversee-scribes` |
| **Arcane Mechanisms** | Service health + system config | `/inner-sanctum/arcane-mechanisms` |
| **Summoning Rituals** | Document upload / ingest (single file + folder batch) | `/inner-sanctum/summoning-rituals` |
| **Incantations & Runes** | System prompt management + pipeline output schemas | `/inner-sanctum/incantations-runes` |
| **Trials of Truth** | HITL retry / re-run pipeline stages | `/inner-sanctum/trials-of-truth` |
| **The Scrivener's Lens** | OCR text quality inspector (native similarity, normalised text) | `/inner-sanctum/scriveners-lens` |
| **The Artificers** | LLM provider management (`llm_providers`) | `/inner-sanctum/the-artificers` |
| **The Assignments** | Stage-to-provider mapping (`stage_inscriptions`) | `/inner-sanctum/the-assignments` |
| **The Vault Nexus** | Supabase connection registry (`supabase_instances`) | `/inner-sanctum/vault-nexus` |
| **The Chronicles** | Fine-tuning / Unsloth export + synthetic data | `/inner-sanctum/the-chronicles` |
| **The Conclave** | User management + invitations (admin only) | `/inner-sanctum/the-conclave` |
| **Personal Sanctum** | User profile / settings | `/personal-sanctum` |

**Naming rules:**
- "Inscriptions" and "stage inscriptions" = the `stage_inscriptions` table (model-to-stage assignments).
  The alias `modelAssignments` exists in schema.ts but `stageInscriptions` is canonical.
- "Vault Nexus" = the Supabase instance registry, not the Supabase database itself.
- "Scribes" = background pipeline workers / jobs, not human reviewers.
- "Archivist" = human HITL reviewer.
- "Reviewer" = a user role (`role = 'reviewer'`) with access to HITL pages but not admin pages.

---

## 2. Database Schema (PostgreSQL via Supabase)

**Engine:** PostgreSQL 15 with `pgvector` extension enabled.
**ORM:** Drizzle ORM (`drizzle-orm/postgres-js`).
**Migration runner:** `node migrate.mjs` (runs on container startup; uses `drizzle-orm/postgres-js/migrator`).
**Migration files:** `drizzle/0000_initial_postgres.sql` through `drizzle/0016_shallow_leo.sql` (17 files total).

### Tables

| Table | Key Fields | Notes |
|---|---|---|
| `users` | `id`, `openId`, `email`, `name`, `role`, `createdAt` | `role` ∈ `user \| reviewer \| admin` |
| `user_profiles` | `userId`, `displayName`, `avatarUrl`, `bio`, `role` | Extended profile |
| `user_permissions` | `userId`, `featureArea`, `canRead`, `canWrite` | Granular feature-area ACL |
| `user_invitations` | `email`, `role`, `token`, `expiresAt`, `usedAt` | Invitation scroll system |
| `system_prompts` | `name`, `content`, `category`, `isActive` | Named prompts for pipeline stages |
| `prompt_versions` | `promptId`, `content`, `version`, `createdBy` | Version history for prompts |
| `system_config` | `key`, `value`, `category`, `description` | Key-value store for runtime config |
| `ingestion_jobs` | `id`, `documentId`, `status`, `startPage`, `endPage`, `blockIndex`, `totalBlocks`, `isPaused`, `storageProvider`, `driveFileId`, `pageOffset`, `blockSize` | `storageProvider` ∈ `local \| google_drive`; `isPaused` enables pause/resume |
| `telemetry_events` | `eventType`, `payload`, `userId` | Append-only event log |
| `llm_providers` | `id`, `name`, `displayName`, `providerType`, `baseUrl`, `encryptedApiKey`, `modelId`, `isActive`, `isLocal` | Credentials encrypted with `CREDENTIAL_ENCRYPTION_KEY` |
| `stage_inscriptions` | `stage`, `primaryProviderId`, `secondaryProviderId`, `promptName`, `temperature`, `maxTokens` | Stage → provider mapping; aliased as `modelAssignments` |
| `supabase_instances` | `id`, `name`, `connectionType`, `role`, `syncMode`, `bootstrapStatus`, `encryptedServiceKey` | Vault Nexus registry |
| `game_systems` | `id`, `name`, `abbreviation`, `publisher`, `edition` | Tome of Knowledge |
| `documents` | `id`, `title`, `gameSystemId`, `documentType`, `status`, `ownerUserId`, `visibility`, `totalPages` | `visibility` ∈ `private \| global` |
| `document_pages` | `id`, `documentId`, `pageNumber`, `rawPngUrl`, `preprocessedPngUrl`, `thumbnailUrl`, `phash`, `wasPreprocessed`, `preprocessingApplied`, `layoutType`, `contentRegions` (JSONB), `continuityFlags` (JSONB), `structuralBreaks` (JSONB), `pageJsonOutput` (JSONB), `phaseStatus`, `isFlagged`, `ocrCompleted`, `ocrConfidence`, `printedPageLabel`, `nativeText`, `hasEmbeddedText` | `printedPageLabel` = label printed on page (e.g. "i", "42"); differs from sequential `pageNumber` |
| `ocr_results` | `pageId`, `rawText`, `markdownText`, `normalisedText`, `nativeSimilarity`, `structuredData` (JSONB), `layoutMetadata` (JSONB), `confidence`, `status`, `pass1Model`–`pass4Model`, `correctedText`, `correctedStructuredData`, `auditLog` (JSONB) | `nativeSimilarity` = token F1 vs native PDF text (null if no embedded text layer) |
| `page_processing_attempts` | `pageId`, `ocrResultId`, `passNumber`, `modelUsed`, `providerName`, `rawTextOutput`, `structuredOutput`, `score`, `wasAccepted`, `processingTimeMs` | One row per LLM pass attempt |
| `hitl_queue` | `pageId`, `ocrResultId`, `reason`, `flagCategory`, `priority`, `status`, `assignedTo`, `resolvedBy` | `status` ∈ `queued \| in_progress \| resolved \| skipped \| escalated`; `flagCategory` ∈ `HITL_FLAG_CATEGORIES` |
| `hitl_retry_attempts` | `hitlItemId`, `pageId`, `requestedStages`, `savedCorrectionFields`, `status`, `confidence`, `modelTrace`, `previousConfidence`, `confidenceDelta`, `regionsBefore`, `previousLayoutType`, `previousRegionCount` | Before-state snapshot for measuring human intervention quality |
| `google_oauth_tokens` | `encryptedAccessToken`, `encryptedRefreshToken`, `expiresAt`, `scope` | Single system-wide Google Drive token; AES-256-GCM encrypted |
| `llm_timing_metrics` | `jobId`, `pageId`, `stage`, `providerId`, `providerName`, `model`, `durationMs`, `tokensUsed`, `isFallback`, `success`, `errorMessage` | Append-only LLM call log |
| `provider_exchange_logs` | `providerId`, `providerName`, `stage`, `jobId`, `pageId`, `model`, `requestMessages`, `requestMeta`, `responseRaw`, `durationMs`, `tokensUsed`, `success`, `errorMessage` | Ring buffer — max `PROVIDER_EXCHANGE_LOG_LIMIT` (21) rows per provider |
| `content_summaries` | `documentId`, `levelType`, `headingText`, `startPageId`, `endPageId`, `shortSummary`, `longSummary`, `keyTerms`, `keyEntities`, `parentId`, `summaryStatus`, `embeddingStatus` | Hierarchical RAG summaries; `levelType` ∈ `chapter \| section \| subsection \| page` |

### Key Enums / Constant Arrays (defined in `drizzle/schema.ts`)

```
PIPELINE_STAGES — 25 stages (see Section 4)
STAGE_PHASES    — maps each stage to phase 1 / 2 / 3 / 0
PROVIDER_TYPES  — "openai_compatible" | "anthropic" | "google" | "openrouter" | "local_lm_studio" | ...
DOCUMENT_TYPES  — "book" | "guide" | "periodical" | "magazine" | "supplement" | "adventure" | "unknown"
DOCUMENT_STATUSES — "pending" | "processing" | "completed" | "failed" | "paused"
LAYOUT_TYPES    — "single_column" | "multi_column" | "mixed" | "image_only" | "table_heavy" | "form"
CONTENT_REGION_TYPES — "body_text" | "heading" | "table" | "image" | "sidebar" | "footer" | "header"
HITL_PRIORITIES — "low" | "medium" | "high" | "critical"
HITL_STATUSES   — "queued" | "in_progress" | "resolved" | "skipped" | "escalated"
HITL_FLAG_CATEGORIES — "provider_exhausted" | "stage_failure" | "low_confidence" | "native_text_divergence" | "manual_flag"
SUMMARY_LEVELS  — "chapter" | "section" | "subsection" | "page"
SUPABASE_CONNECTION_TYPES — "supabase_local" | "supabase_cloud" | "postgres_docker"
```

---

## 3. tRPC Router Map

All procedures are under `/api/trpc`. Access levels: `publicProcedure`, `protectedProcedure` (any
logged-in user), `reviewerProcedure` (reviewer or admin), `adminProcedure` (admin only).

| Namespace | Procedures |
|---|---|
| `auth` | `me`, `logout` |
| `health` | `ping` (public), `database`, `all` (per-provider circuit state + agents/cloud orbs) |
| `profile` | `get`, `upsert` |
| `permissions` | `mine` |
| `prompts` | `list`, `getByName`, `upsert`, `history`, `seedDefaults` |
| `ramblings` | `generate` |
| `config` | `list`, `byCategory`, `set`, `delete` |
| `jobs` | `list`, `active`, `get`, `stats`, `create`, `delete`, `clear`, `purgePages`, `cancel`, `pause`, `resume`, `updateStatus` |
| `telemetry` | `record`, `events`, `summary` |
| `admin` | `listUsers`, `getUser`, `setRole`, `deleteUser`, `setPermission`, `removePermission`, `listInvitations`, `createInvitation`, `revokeInvitation`, `featureAreas`, `wipeProcessingData` |
| `providers` | `list`, `get`, `create`, `update`, `delete`, `test`, `discoverModels`, `types` |
| `assignments` | `list`, `byStage`, `upsert`, `update`, `delete`, `stages`, `topology` |
| `connections` | `list`, `get`, `create`, `update`, `delete`, `setActive`, `test`, `setBootstrapStatus`, `types` |
| `library` | `listDocuments`, `searchDocuments`, `getDocument`, `getPages`, `getPageWithOcr`, `createDocument`, `updateDocument`, `deleteDocument`, `getByJobId`, `browsePagesWithOcr`, `getPageDetail`, `listPages`, `exportUnsloth`, `addPage`, `upsertOcrResult`, `textQuality`, `exportFull`, `documentStatuses` |
| `hitl` | `list`, `get`, `stats`, `flag`, `assign`, `resolve`, `skip`, `escalate`, `saveCorrection`, `retryPage`, `getRetryAttempts`, `clear`, `bulkResolve`, `nextUnreviewed`, `exportOcr`, `exportTrainingData`, `categoryStats`, `bulkRetryByCategory` |
| `pipeline` | `ingestPage`, `submitOcrResult`, `flagPage`, `documentStatus`, `stats`, `exchangeLogs`, `enqueueBboxRescan`, `stageMetrics`, `retryQueue` |
| `google` | `status`, `getAccessToken`, `disconnect` |
| `metrics` | `byPage`, `jobSummary`, `pageSummary`, `providerSummary` |
| `gameSystems` | `list`, `listAll`, `create`, `update`, `delete` |
| `summaries` | `listByDocument`, `listByDocumentIds`, `update`, `approve`, `approveAll` |
| `system` | `notifyOwner` |

---

## 4. Pipeline Architecture

### Stage List and Phases

| Phase | Stages |
|---|---|
| **Phase 1** (ingestion / layout) | `document_registration`, `document_intelligence`, `pdf_to_png`, `pdf_text_extract`, `layout_analysis`, `layout_classification`, `bbox_detection`, `content_type_classify`, `child_image_extraction` |
| **Phase 2** (OCR / extraction) | `ocr_extraction`, `content_break_detect`, `summarisation`, `quality_validation`, `pass_comparison`, `ocr_validation`, `tabular_extraction`, `content_break_id`, `summarization`, `json_assembly`, `quality_assessment` |
| **Phase 3** (enrichment) | `artifact_storage`, `embedding_generation`, `database_load` |
| **Phase 0** (special / standalone) | `voice_of_arkanum`, `referee` |

> **Note:** `pdf_column_detect` is an **internal sub-stage** within the runner (not in `PIPELINE_STAGES`)
> that runs whitespace density analysis followed by optional LLM validation to detect 1/2/3-column
> layouts. Results are stored in `document_pages.layoutType` and influence column-aware OCR extraction.

### Key Pipeline Files

| File | Purpose |
|---|---|
| `server/pipeline/runner.ts` | Main orchestrator (~2739 lines) — `startJob`, `pauseJob`, `resumeJob`, `cancelAllActiveJobs`, `recoverQueuedJobs`, `retryPageStages`, `exportDocumentAsUnsloth`, `detectColumnsFromLayoutText`, `reconstructColumnFlows` |
| `server/pipeline/invoke.ts` | LLM dispatch — `dispatchToProvider`, circuit breaker (trips after 3 consecutive failures, 5-min cooldown), `fetchWithRetry` |
| `server/pipeline/config.ts` | `pipeline-config.yaml` loader — read once at startup |
| `server/_core/fetch-retry.ts` | Network resilience — exponential backoff for transient gateway resets |

### Concurrency Model

- **Document concurrency:** `maxConcurrentDocuments` (default 2) — controls how many documents are
  processed simultaneously. Chained blocks for the same document never wait for a slot.
- **LLM concurrency:** `maxLlmConcurrency` (default 4) — semaphore limiting simultaneous LLM calls
  across all pages.
- **Retry queue:** `retryTaskQueue` — HITL-triggered stage retries are serialised through a separate
  queue to avoid starving the main pipeline.

### Circuit Breaker

Per-provider in-memory state. After `CIRCUIT_TRIP_THRESHOLD` (3) consecutive full-call failures, the
provider circuit opens. It remains open for `CIRCUIT_COOLDOWN_MS` (5 minutes). A half-open probe is
allowed after cooldown; success closes the circuit, failure re-trips it immediately. Circuit state is
visible in `health.all` and in The Artificers page.

### Image Preprocessing

Controlled by `pipeline-config.yaml` (`binarize` section). When `enabled: true`, Sharp converts pages
to grayscale, optionally sharpens, and applies Otsu auto-threshold binarization before LLM OCR stages.
Original high-res PNG is preserved as `rawPngUrl`; binarized version is `preprocessedPngUrl`.
**Visual stages (layout, bbox) use the original image; text stages (OCR) use the preprocessed image.**

### Native PDF Text

`pdf_text_extract` runs `pdftotext` on each page and stores the result in `document_pages.nativeText`.
This is passed to LLM stages as a ground-truth hint. `nativeSimilarity` in `ocr_results` measures
token-level F1 between OCR output and native text (null when no embedded text layer exists).
The Scrivener's Lens page surfaces this for quality inspection.

### Column Detection

`detectColumnsFromLayoutText` analyses whitespace density across sampled lines to detect gutter
positions and infer 1/2/3-column layout. `reconstructColumnFlows` then splits the pdftotext layout
output into per-column text flows for correct reading-order OCR. This runs as part of `pdf_text_extract`
and the result is stored in `document_pages.layoutType`.

---

## 5. Critical Shape Contracts

These are the most common source of type mismatches. Verify before writing any UI code.

### `hitl.list` — sidebar list item shape

```ts
{
  // All HitlQueueItem fields spread at top level (id, pageId, status, priority, reason, flagCategory, ...)
  page: {
    number: number | null;   // ← NOTE: page.number, NOT item.pageNumber
    image_url: string | null;
    layout_type: string | null;
    ocr_confidence: number | null;
  };
  document: { title: string; ... };
  ocr: OcrResult | null;
}
```

> **Common mistake:** `item.pageNumber` — this field does **not** exist at the top level. Use `item.page?.number`.

### `hitl.get` — full detail shape

```ts
{
  item: HitlQueueItem;
  page: DocumentPage | null;
  document: Document | null;
  ocr: OcrResult | null;
  attempts: PageProcessingAttempt[];
  retryAttempts: HitlRetryAttempt[];
}
```

### `hitl.categoryStats` — return shape

```ts
Array<{ category: string; queued: number; total: number }>
```

### `pipeline.stageMetrics` — return shape (Artificer Performance panel)

```ts
Array<{
  stage: string;
  provider_name: string;
  call_count: number;
  failure_count: number;
  fallback_count: number;
  avg_duration_ms: number;
  peak_duration_ms: number;
}>
```

### `assignments.topology` — stage topology shape

```ts
{
  stages: Array<{
    stage: PipelineStage;
    phase: 1 | 2 | 3 | 0;
    inscription: StageInscription | null;
    primaryProvider: LlmProvider | null;
    secondaryProvider: LlmProvider | null;  // ← "secondary", not "fallback"
  }>;
}
```

### `document_pages.contentRegions` — JSONB array item shape

```ts
{
  sequence: number;
  regionType: string;        // ∈ CONTENT_REGION_TYPES
  bbox: { x: number; y: number; w: number; h: number };
  childImageUrl?: string;
  contentTypeFlags?: string[];
  isMixedBoundary?: boolean;
}
```

---

## 6. Environment Variables

### Required at Runtime

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — must include `?sslmode=disable` for Docker bridge networks |
| `JWT_SECRET` | Session cookie signing — minimum 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypting LLM provider API keys and Supabase service keys — should differ from `JWT_SECRET` |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OWNER_OPEN_ID` | Manus open-id of the deployer — auto-promoted to admin on first login |
| `OWNER_NAME` | Display name for the owner |
| `ANON_KEY` | Supabase anon JWT (from Supabase stack) |
| `SERVICE_ROLE_KEY` | Supabase service role JWT (from Supabase stack) |

### Optional

| Variable | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | — | Supabase Kong gateway URL (e.g. `http://supabase-kong:8000`) |
| `SUPABASE_ANON_KEY` | — | Same as `ANON_KEY` — used by server-side Supabase client |
| `SUPABASE_SERVICE_KEY` | — | Same as `SERVICE_ROLE_KEY` — used by server-side Supabase client |
| `GOOGLE_CLIENT_ID` | — | Google OAuth — required for Google Drive integration |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth — required for Google Drive integration |
| `GOOGLE_API_KEY` | — | Google API key — required for Drive file picker |
| `APP_URL` | `http://localhost:3000` | Canonical public URL — must match Google OAuth redirect URI |
| `ADMIN_EMAIL` | — | Email auto-promoted to admin on every login (alternative to `OWNER_OPEN_ID`) |
| `PIPELINE_WORKSPACE` | `/app/workspace` | Local directory for pipeline temp files — **must be volume-mounted in production** |
| `PIPELINE_CONFIG_PATH` | `/app/pipeline-config.yaml` | Override path for pipeline config file |
| `BUILT_IN_FORGE_API_URL` | — | Manus-hosted LLM API base URL (leave blank for self-hosted) |
| `BUILT_IN_FORGE_API_KEY` | — | Manus-hosted LLM API key |
| `VITE_FRONTEND_FORGE_API_URL` | — | Frontend access to Manus built-in APIs |
| `VITE_FRONTEND_FORGE_API_KEY` | — | Frontend key for Manus built-in APIs |
| `VITE_APP_TITLE` | `TTRPG OCR Console` | Browser tab title |
| `VITE_APP_LOGO` | — | Logo URL |
| `IMAGE_TAG` | `latest` | Docker image tag for Portainer stack |
| `HOST_PORT` | `3000` | Host port mapping |
| `OAUTH_SERVER_URL` | `https://api.manus.im` | Manus OAuth backend |
| `VITE_OAUTH_PORTAL_URL` | `https://manus.im` | Manus login portal |

> **Deployment gap:** `portainer-stack.yml` does not yet include `GOOGLE_CLIENT_ID`,
> `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `APP_URL`, `ADMIN_EMAIL`, or a `volumes:` mount for
> `PIPELINE_WORKSPACE`. These must be added manually in Portainer or via a stack file update.

---

## 7. User Roles and Access Control

| Role | Access |
|---|---|
| `user` | Read-only library, personal sanctum, Tome of Knowledge, Divination Omens |
| `reviewer` | All `user` access + Archivist's Desk, Trials of Truth, Scrivener's Lens (HITL pages) |
| `admin` | Full access including The Conclave, Arcane Mechanisms, Summoning Rituals, Artificers, Assignments, Vault Nexus, Chronicles |

**Promotion:** Set `role = 'admin'` directly in the database, or set `OWNER_OPEN_ID` / `ADMIN_EMAIL`
env vars for automatic promotion on login. The Conclave page (admin only) also provides a UI for role
management.

**Frontend gate components:**
- `AdminGate` — wraps admin-only UI sections
- `ReviewerGate` — wraps reviewer-or-admin UI sections

---

## 8. Key Architectural Conventions

### Data Access Pattern

- **Never filter ownership in JavaScript post-query.** Always push
  `WHERE ownerUserId = ? OR visibility = 'global'` into the Drizzle SQL query.
  (`listDocuments` and `searchDocuments` currently violate this — see Known Issues.)
- All database helpers live in `server/db.ts` (~2014 lines). Procedures in `server/routers.ts` call helpers, not raw SQL.
- Timestamps are stored as UTC `timestamp` columns. Frontend converts to local timezone with
  `new Date(ts).toLocaleString()`.

### Credential Encryption

- LLM provider API keys and Supabase service keys are encrypted at rest using AES-256-GCM.
- Encryption/decryption is in `server/crypto.ts`. Key = `CREDENTIAL_ENCRYPTION_KEY` env var.
- The `SecretHint` type uses fields `keyPrefix`, `keySuffix`, `keyLength`
  (not `prefix`, `suffix`, `length` — a common mistake).

### Runtime Config Injection

- OAuth URLs and app metadata are injected at runtime via `window.__RUNTIME_CONFIG__`
  (see `server/_core/static.ts`) rather than only at build time. This allows the same Docker image
  to be deployed to different OAuth environments without rebuilding.

### Pipeline Config

- `pipeline-config.yaml` is read once at server startup by `server/pipeline/config.ts`.
- A server restart is required for config changes to take effect.
- The file should be volume-mounted into the container at `/app/pipeline-config.yaml`.

### Migrations

- `node migrate.mjs` runs automatically on container startup before the Express server starts.
- Drizzle tracks applied migrations in the `__drizzle_migrations` table.
- To add a migration: edit `drizzle/schema.ts`, run `pnpm db:push` locally (generates SQL + updates
  journal), commit both the `.sql` file and the updated `drizzle/meta/_journal.json`.
- SSL mode is driven by the connection string: include `?sslmode=disable` for self-hosted Docker
  bridge networks; omit for Supabase Cloud (TLS is required).

### HITL Category System

Five `flagCategory` values drive the Archivist's Desk category panel and bulk retry:

| Category | Meaning | Default retry stages |
|---|---|---|
| `provider_exhausted` | All providers failed / circuit-broken | layout_analysis, bbox_detection, ocr_extraction |
| `stage_failure` | Malformed JSON, timeout, or other stage error | ocr_extraction |
| `low_confidence` | Confidence below configured threshold | ocr_extraction |
| `native_text_divergence` | OCR diverges significantly from embedded PDF text | ocr_extraction |
| `manual_flag` | Manually flagged by a reviewer | (none — manual selection) |

---

## 9. Known Issues and Pending Work

### TypeScript Errors (22 total as of v0.2.29)

| File | Error | Fix |
|---|---|---|
| `tsconfig.json` | `target` is unset (defaults to ES3) — causes `Set`/`Map` iteration errors in 6+ locations across `routers.ts`, `runner.ts`, and `TrialsOfTruth.tsx` | Add `"target": "ES2020"` to `tsconfig.json` |
| `BboxRegionEditor.tsx:349,356,490` | `Partial<Box>` not assignable to intersection type | Widen the `bbox` prop type or cast explicitly |
| `DriveFilePicker.tsx:21` + `Map.tsx:85,144` | `google` global declaration conflict between `@types/google.maps` and `@types/google.picker` | Add `/// <reference types="@types/google.maps" />` to DriveFilePicker; remove duplicate declaration in Map.tsx |
| `TrialsOfTruth.tsx:596` | `any[][]` not assignable to `[string, unknown][]` | Add explicit type annotation |
| `runner.ts` | Cannot find module `sharp` | Run `pnpm add sharp` and ensure `libvips` is in the Dockerfile (`apk add vips-dev`) |
| `routers.ts:2878–2879` | `doc` possibly `undefined` | Add null guard before accessing `doc.id` / `doc.title` |

### Pending Features / Bugs

| # | Item | Priority |
|---|---|---|
| 1 | `tsconfig.json` missing `"target": "ES2020"` — root cause of 8+ TS errors | High |
| 2 | `listDocuments` / `searchDocuments` — ownership filter is JS post-filter, not SQL | High |
| 3 | `portainer-stack.yml` missing `volumes:` for `PIPELINE_WORKSPACE` — workspace is ephemeral across container restarts | High |
| 4 | `portainer-stack.yml` missing Google Drive env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `APP_URL`) | Medium |
| 5 | `multer.memoryStorage()` for uploads up to 200 MB — should use `diskStorage()` to avoid heap exhaustion | Medium |
| 6 | No rate limit on `/api/upload/ingest` — unbounded with folder upload enabled | Medium |
| 7 | Email dispatch for invitation scrolls not implemented (DB records created, never sent) | Medium |
| 8 | `preprocessPageImages` is serial (`for...of` + `await`) — should use bounded `Promise.all` | Low |
| 9 | Test: `listDocuments` scoped by ownership | Low |
| 10 | `markdownText` stored in `ocr_results` but not returned by `hitl.get` or `library.getPageDetail` — Archivist's Desk has no Markdown tab | Low |

---

## 10. Deployment Reference

### Docker Image

- Registry: `ghcr.io/pakgrou-porg/ttrpg-ocr-console`
- Tags: semver (e.g. `0.2.29`) and `:latest`
- Build: GitHub Actions on every push to `main` and on version tags

### Container Startup Sequence

1. `node migrate.mjs` — applies pending Drizzle SQL migrations against `DATABASE_URL`
2. `node dist/index.js` — starts Express + tRPC server on `PORT` (default 3000)

### Network Topology (Self-Hosted)

- The console container joins the external Docker network `supabase_net`
- Internal hostname `supabase-db:5432` → PostgreSQL 15
- Internal hostname `supabase-kong:8000` → Supabase Kong API gateway (REST, Storage, Auth)
- `DATABASE_URL` must include `?sslmode=disable` for the internal Docker bridge (no TLS cert)

### Portainer Stack File

`portainer-stack.yml` at project root. Required env vars to set in Portainer UI:
`POSTGRES_PASSWORD`, `JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `VITE_APP_ID`,
`OWNER_OPEN_ID`, `OWNER_NAME`, `ANON_KEY`, `SERVICE_ROLE_KEY`

---

## 11. File Structure Quick Reference

```
client/src/pages/          ← 17 page components (see Section 1 for mapping)
client/src/components/
  BboxRegionEditor.tsx     ← Interactive bbox region editor with keyboard shortcuts (N/A/F shortcuts)
  BboxOverlay.tsx          ← Read-only bbox overlay for quality verification
  ReviewerGate.tsx         ← Access gate for reviewer/admin roles
  AdminGate.tsx            ← Access gate for admin role only
  DashboardLayout.tsx      ← Sidebar layout used by all Inner Sanctum pages
  DriveFilePicker.tsx      ← Google Drive file picker (requires GOOGLE_API_KEY)
drizzle/
  schema.ts                ← Single source of truth for all tables, enums, and types (~824 lines)
  0000_initial_postgres.sql … 0016_shallow_leo.sql  ← 17 migration files
server/
  routers.ts               ← All tRPC procedures (~3073 lines; split into namespaces)
  db.ts                    ← Query helpers (~2014 lines; called by routers, never raw SQL in routers)
  crypto.ts                ← AES-256-GCM encrypt/decrypt for credentials
  pipeline/
    runner.ts              ← Pipeline orchestrator (~2739 lines)
    invoke.ts              ← LLM dispatch + circuit breaker + fetchWithRetry
    config.ts              ← pipeline-config.yaml loader
  _core/
    env.ts                 ← All env var access (use ENV.* not process.env.* directly)
    static.ts              ← Runtime config injection (window.__RUNTIME_CONFIG__)
    fetch-retry.ts         ← Exponential backoff fetch wrapper
pipeline-config.yaml       ← Pipeline tuning knobs (DPI, thresholds, concurrency, binarize)
portainer-stack.yml        ← Portainer deployment stack (self-hosted)
migrate.mjs                ← Standalone migration runner (no drizzle-kit at runtime)
CONTEXT.md                 ← This file
todo.md                    ← Pending work items
```
