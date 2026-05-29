# TTRPG OCR Console — Session Context

> **Purpose:** Concise working context for AI development sessions. Load this file alongside `CONTEXT.md` at the start of any session. `CONTEXT.md` is the canonical vocabulary and schema reference; this file captures current project state, pending work, and session-to-session continuity.
>
> **Current version:** v0.1.48 (BBox Region Overlay — last tag pushed to GHCR)

---

## 1. Current Project State

The console is a production-grade React + tRPC + Express + Drizzle/PostgreSQL application that manages a multi-phase TTRPG PDF OCR pipeline. All major infrastructure phases are complete:

- Auth (OAuth via Manus), RBAC, invitations
- LLM provider registry with capability flags + model discovery
- Stage inscriptions (per-stage provider assignments, prompt references, temperature/maxTokens)
- Full pipeline execution engine (`server/pipeline/runner.ts`) with multi-pass fallback and HITL auto-queuing
- Document library browser (Enter the Arkanum), HITL review (Archivist's Desk), job monitor (Oversee the Scribes)
- Bbox overlay visualization (BboxOverlay + BboxOverlayToggle components)
- Per-stage timing metrics (`llm_timing_metrics` table, `assignments.timingMetrics` procedure)
- Prompt versioning with auto-increment, 3-version trim, and restore UI
- Collapsible sidebar with floating boundary arrow toggle
- Docker multi-stage build, `migrate.mjs` standalone migrator, GitHub Actions CI + release workflows
- 128/128 tests passing

---

## 2. Open Issues (Priority-Ordered)

These are confirmed bugs and gaps — check this list before starting any task.

| # | File(s) | Issue | Priority |
|---|---|---|---|
| 1 | `tsconfig.json` | Missing `"target": "ES2020"` — causes `Set`/`Map` iteration TS errors in `TrialsOfTruth.tsx`, `oauth.ts`, `routers.ts` | High |
| 2 | `ArchivistsDesk.tsx:337` | `item.pageNumber` should be `item.page?.number` — field does not exist at top level | High |
| 3 | `portainer-stack.yml` | Missing `volumes:` section for `PIPELINE_WORKSPACE` — workspace ephemeral on container restart | High |
| 4 | `uploadIngestRoute.ts:39` | `multer` `fileFilter` callback type error — pass `null` explicitly: `cb(null, true)` / `cb(new Error(...), false)` | Medium |
| 5 | `server/pipeline/runner.ts` | `Cannot find module 'sharp'` TS error — add `@types/sharp` to devDependencies | Medium |
| 6 | `routers.ts` (`hitl.get`, `library.getPage`) | `markdownText` stored in `ocr_results` but not returned — UI cannot display it | Medium |
| 7 | `server/pipeline/runner.ts` | `preprocessPageImages()` is serial `for...of + await` — should use bounded `Promise.all` | Medium |
| 8 | `server/routers.ts` | `listDocuments` / `searchDocuments` ownership filter is a JS post-filter, not SQL `WHERE` — breaks pagination correctness | Medium |
| 9 | `server/routers.ts` | Email dispatch for invitations not implemented — records created in DB but never sent | Low |
| 10 | `uploadIngestRoute.ts` | `multer.memoryStorage()` for up to 200 MB uploads — should use `diskStorage()` to avoid heap pressure | Low |
| 11 | No rate limit on `/api/upload/ingest` — unbounded concurrent uploads possible | Low |

---

## 3. Confirmed Incomplete Todo Items

These are explicitly `[ ]` in `todo.md`:

```
[ ] Test: document list scoped by ownership
    → listDocuments should filter WHERE ownerUserId = ? OR visibility = 'global'
    → Test file: server/library.test.ts (add new describe block)

[ ] listDocuments: push ownership filter into SQL WHERE clause
    → Currently JS post-filter in routers.ts — incorrect when pagination is applied
    → db.ts helper: getAllDocuments(userId, visibility?) needs WHERE clause

[ ] searchDocuments: same ownership fix as listDocuments

[ ] Email dispatch for invitation scrolls
    → Invitations are created in user_invitations table but never emailed
    → Needs email service integration (Resend / SMTP / Nodemailer)
    → env.ts: add SMTP_HOST, SMTP_FROM, RESEND_API_KEY (pick one)
```

---

## 4. Architecture Quick Reference

### Adding a new tRPC procedure

1. Add a Zod input schema in `server/routers.ts` under the relevant namespace
2. Use `protectedProcedure` (any logged-in user) or `adminProcedure` (admin-only)
3. Add a DB helper in `server/db.ts` if new queries are needed
4. Write a test in the matching `server/*.test.ts` file using the tRPC caller pattern

### Adding a new database column

1. Edit `drizzle/schema.ts`
2. Run `pnpm db:generate` to produce a migration SQL file in `drizzle/migrations/`
3. Run `pnpm db:migrate` (or `node migrate.mjs`) to apply it
4. Update the matching helper(s) in `server/db.ts`
5. Update `CONTEXT.md` — section 2 table

### Adding a new pipeline stage

1. Add the stage name to `PIPELINE_STAGES` array in `drizzle/schema.ts`
2. Add to `STAGE_PHASES` map in `drizzle/schema.ts`
3. Add stage handler in `server/pipeline/runner.ts`
4. Add to `STAGE_META` and `PIPELINE_FLOW` in `PipelineVisualization.tsx`
5. If LLM-driven: add a `PROMPT_TABS` entry in `IncantationsRunes.tsx`
6. Seed a default prompt in `scripts/seed-prompts.mjs`

### Adding a new UI page

1. Create `client/src/pages/NewPage.tsx`
2. Add route in `client/src/App.tsx`
3. Add nav entry in `client/src/components/Layout.tsx` (with thematic name)
4. Add card to `client/src/pages/Home.tsx` dashboard if it's a top-level feature

---

## 5. Key Shape Contracts (Gotchas)

### `hitl.list` items

- Use `item.page?.number` — **not** `item.pageNumber` (does not exist)
- `item.page?.image_url` — the image URL is nested under `page`

### `assignments.topology` response

```ts
stages[].inscription     // StageInscription | null
stages[].primaryProvider // LlmProvider | null
stages[].phase           // 1 | 2 | 3 | 0
```

### `providers.list` API key masking

- Never decrypt `encryptedApiKey` in list views
- Use `keyPrefix` + `keySuffix` + `keyLength` (stored at write time)

### `stage_inscriptions.promptName`

- References `system_prompts.name` (not inline text)
- Auto-set to the stage name slug on inscription save
- `null` means "no prompt assigned"

---

## 6. Test Suite Patterns

All tests live in `server/*.test.ts` and use the tRPC caller pattern:

```ts
// Authenticated user context
const caller = appRouter.createCaller({
  user: { id: 1, role: "user", openId: "test-openid" },
  req: mockReq,
  res: mockRes,
});

// Admin context
const adminCaller = appRouter.createCaller({
  user: { id: 1, role: "admin", openId: "test-openid" },
  req: mockReq,
  res: mockRes,
});
```

**Missing high-value tests (add these next):**

- `buildMarkdownText` unit test with fixture data
- `fetchWithRetry` — retry on network error, HTTP 429, no retry on `AbortError`
- `hitl.list` shape assertion (catches `item.pageNumber` bug at test time)
- `POST /api/upload/ingest` — file type rejection (non-PDF)
- `pipeline.submitOcrResult` with `markdownText` field
- `listDocuments` scoped by ownership (the only explicit `[ ]` test in todo.md)

---

## 7. File Map (Quick Lookup)

```
drizzle/schema.ts              Tables, enums, PIPELINE_STAGES, STAGE_PHASES
server/db.ts                   All query helpers (~2,000 lines — check before writing new queries)
server/routers.ts              All tRPC procedures (~3,500 lines)
server/pipeline/runner.ts      Pipeline execution engine, stage functions, preprocessing
server/pipeline/invoke.ts      LLM dispatch, fetchWithRetry, buildProviderCall
server/pipeline/config.ts      pipeline-config.yaml loader (singleton)
server/_core/env.ts            Environment variable access (single source of truth)
server/_core/crypto.ts         AES-256-GCM credential encryption, storeSecretHint
server/uploadIngestRoute.ts    POST /api/upload/ingest (multer, auth, job creation)
client/src/pages/              19 page components (see CONTEXT.md §1 for route mapping)
client/src/components/         Shared UI components
client/src/hooks/usePermission.ts   Feature-area access control hook
pipeline-config.yaml           Runtime tuning (DPI, concurrency, binarize params)
portainer-stack.yml            Production Docker Compose for Portainer
migrate.mjs                    Standalone DB migration runner
```

---

## 8. Environment Checklist (Development)

Minimum `.env` for local `pnpm dev`:

```
DATABASE_URL=postgresql://user:pass@localhost:5432/ttrpg_ocr
JWT_SECRET=<32+ chars>
CREDENTIAL_ENCRYPTION_KEY=<32+ chars, different from JWT_SECRET>
VITE_APP_ID=<manus-app-id>
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://manus.im
OWNER_OPEN_ID=<your-manus-openid>
OWNER_NAME=<your-name>
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_KEY=<service-key>
```

---

## 9. Deployment State

- Docker image: `ghcr.io/pakgrou-porg/ttrpg-ocr-console:v0.1.48`
- CI: `.github/workflows/ci.yml` runs `pnpm test` on push/PR
- Release: `.github/workflows/release.yml` builds + pushes to GHCR on version tag push
- Migrations run automatically at container start via `node migrate.mjs` in the Dockerfile CMD
- `PIPELINE_WORKSPACE` must be volume-mounted in production (see issue #3 above — `portainer-stack.yml` missing this volume)

---

## 10. Conventions

- **No inline comments** unless the WHY is non-obvious
- **No `any` types** — use proper Drizzle inferred types or Zod schemas
- **Thematic names** in UI copy and navigation (see CONTEXT.md §1) — never use the technical names in user-facing text
- **Encryption:** always use `encryptSecret()` / `decryptSecret()` from `server/_core/crypto.ts` for credentials — never store plaintext keys
- **Procedure access:** `protectedProcedure` for authenticated users, `adminProcedure` for admin-only mutations
- **Pagination:** all list procedures should accept `limit` + `offset` or `cursor` — never return unbounded result sets
