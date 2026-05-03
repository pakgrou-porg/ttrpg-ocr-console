# TTRPG OCR Console - Evos' Infinite Kodex

- [x] Update `Layout.tsx` navigation menu with thematic names.
- [x] Update `App.tsx` routes and imports for the renamed pages.
- [x] Rename and update `UsingData.tsx` to `EnterArkanum.tsx` ("Enter the Arkanum").
- [x] Rename and update `PerusingData.tsx` to `ListenRamblings.tsx` ("Listen to Ramblings") - add random subject generator.
- [x] Rename and update `HowToUse.tsx` to `TomeKnowledge.tsx` ("Tome of Knowledge").
- [x] Rename and update `MonitoringJobs.tsx` to `OverseeScribes.tsx` ("Oversee the Scribes").
- [x] Rename and update `UsageStats.tsx` to `DivinationOmens.tsx` ("Divination & Omens").
- [x] Rename and update `ConfigSystems.tsx` to `ArcaneMechanisms.tsx` ("Arcane Mechanisms").
- [x] Rename and update `ConfigContent.tsx` to `SummoningRituals.tsx` ("Summoning Rituals").
- [x] Rename and update `ConfigPrompts.tsx` to `IncantationsRunes.tsx` ("Incantations & Runes") - add prompt for Ramblings AI.
- [x] Update `Home.tsx` dashboard cards with the new thematic names.
- [x] Rename console to "Evos' Infinite Kodex" with subtitle "Vault of Lore"
- [x] Replace all instances of "Arcanum" with "Arkanum" across all files
- [x] Upgrade project to web-db-user (backend + database + auth)
- [x] Create database schema for user_profiles and system_prompts tables
- [x] Implement nested navigation in Layout.tsx (The Inner Sanctum collapsible group)
- [x] Build PersonalSanctum page (user profile, preferences, saved lore stats)
- [x] Connect Incantations & Runes to system_prompts database table via tRPC
- [x] Add user login/logout to sidebar and Home page header
- [x] Write vitest tests for profile and prompts procedures

## Phase: Admin, Access Control & Grand Hall Redesign

- [x] Add user_permissions and feature_restrictions tables to drizzle schema
- [x] Add db helpers for user management and permission queries
- [x] Add tRPC admin procedures (list users, create user, update permissions, feature restrictions)
- [x] Redesign Grand Hall with atmospheric orb-based status (Arkanum, Agents, Scribes)
- [x] Add avatar icon to top-right header with dropdown for self-service profile
- [x] Build Admin User Management page (The Conclave) inside The Inner Sanctum
- [x] Move system status details into Arcane Mechanisms page
- [x] Update Layout.tsx to add The Conclave to Inner Sanctum submenu (admin only)
- [x] Write vitest tests for admin and permission procedures

## Phase: Live Features & Telemetry

- [x] Add system_config table to drizzle schema
- [x] Add ingestion_jobs and telemetry_events tables to drizzle schema
- [x] Build tRPC health-check procedures (ping DB, LM Studio, OpenRouter)
- [x] Build tRPC permission enforcement hook (usePermission)
- [x] Build tRPC procedure for Listen to Ramblings (LLM invocation with voice_of_arkanum prompt)
- [x] Build tRPC procedures for Oversee the Scribes (live job queue)
- [x] Build tRPC procedures for system_config CRUD (Arcane Mechanisms persistence)
- [x] Build tRPC procedures for telemetry data (Divination & Omens)
- [x] Update Grand Hall orbs to use live health-check data
- [x] Build usePermission hook and gate feature areas on frontend
- [x] Wire Listen to Ramblings page to LLM tRPC procedure
- [x] Connect Oversee the Scribes to live job queue data
- [x] Persist Arcane Mechanisms config fields to system_config table
- [x] Connect Divination & Omens charts to real telemetry data
- [x] Write vitest tests for health-check procedures
- [x] Write vitest tests for permission enforcement
- [x] Write vitest tests for ramblings LLM procedure
- [x] Write vitest tests for system_config procedures
- [x] Write vitest tests for telemetry procedures
- [x] Write vitest tests for ingestion job procedures

## Phase: LLM Provider Management & Database Connection Config

- [x] Add llm_providers table to drizzle schema (name, type, baseUrl, encryptedApiKey, isActive)
- [x] Add model_assignments table to drizzle schema (providerId, modelName, pipelineStage, priority)
- [x] Add db_connections table to drizzle schema (name, type, host, port, database, encryptedCredentials, isActive)
- [x] Build tRPC procedures for provider CRUD with encrypted API key storage
- [x] Build tRPC procedures for model assignment matrix (assign/unassign models to stages)
- [x] Build tRPC procedures for database connection management with connection testing
- [x] Build LLM Provider Registry UI page (The Artificers)
- [x] Build Model Assignment Matrix UI page (The Assignments)
- [x] Build Database Connection Config UI page (The Vault Nexus)
- [x] Update Layout.tsx to add new pages to The Inner Sanctum submenu
- [x] Write vitest tests for provider, assignment, and connection procedures

## Phase: Provider Test Connection & Model Discovery
- [x] Add tRPC procedure for provider test connection (ping baseUrl)
- [x] Add tRPC procedure for model discovery (query /v1/models endpoint)
- [x] Update The Artificers UI with Test Connection button per provider
- [x] Update The Artificers UI with Discover Models button that auto-populates available models
- [x] Write vitest tests for test connection and model discovery procedures

## Phase: Provider Preset Auto-Population
- [x] Define provider presets (OpenRouter, Venice.ai, OpenAI, LM Studio, Anthropic, Google) with default baseUrl values
- [x] Auto-populate baseUrl and name when selecting provider type in Create form
- [x] Add Edit dialog for existing providers with same auto-populate behavior
- [x] Keep all auto-populated fields editable by the user
- [x] Write vitest tests for provider presets behavior (covered by existing provider CRUD tests)

## Phase: Library Shelves Browser & HITL Review
- [x] Add documents table (source PDFs: name, game, version, page count, status)
- [x] Add document_pages table (page images: documentId, pageNumber, imageUrl, thumbnailUrl, phash)
- [x] Add ocr_results table (extracted data per page: pageId, rawText, structuredData, confidence, status)
- [x] Add hitl_queue table (pages flagged for review: pageId, reason, priority, assignedTo, resolution)
- [x] Build tRPC procedures for document/page browsing (list docs, get pages, get OCR results)
- [x] Build tRPC procedures for HITL editing (update OCR results, resolve queue items, flag pages)
- [x] Build shared LibraryShelves component (image viewer + OCR data side-by-side, page navigation)
- [x] Integrate LibraryShelves into Enter the Arkanum (view-only mode)
- [x] Build HITL Review page (Archivist's Desk) with editing capabilities
- [x] Add Archivist's Desk to navigation and routing
- [x] Write vitest tests for library and HITL procedures (30 test cases)
- [x] Push full codebase to GitHub via PAT (https://github.com/pakgrou-porg/ttrpg-ocr-console)

## Phase: Pipeline Integration, Upload Flow & HITL UX

- [x] Add pipeline tRPC procedures: ingestPage, submitOcrResult, flagPage (with phash duplicate detection + auto-flagging)
- [x] Add REST upload endpoint /api/upload/document (multer + S3 + document record creation)
- [x] Build PDF/document upload card in Library Shelves (drag-and-drop, progress indicator, status feedback)
- [x] Add "Next Unreviewed" auto-advance CTA button to Archivist's Desk (jumps to oldest critical/high unresolved item)
- [x] Write vitest tests for pipeline procedures (8 new tests, 96 total passing)
- [x] Push updated codebase to GitHub (origin/main is up to date — checkpoint auto-committed)

## Phase: P0 Security Fixes & P1 Reliability (Security Review)

### P0 — Security Correctness
- [x] Auth middleware before Multer file parsing in uploadRoutes.ts
- [x] PDF magic-byte validation (%PDF- header check) after buffer available
- [x] Startup guard: fail fast if JWT_SECRET missing or < 32 chars in env.ts (warns for platform-injected secrets)
- [x] Add CREDENTIAL_ENCRYPTION_KEY env var; separate from session secret in crypto.ts
- [x] Prompt mutations (upsert, seedDefaults) upgraded to adminProcedure
- [x] Telemetry record write endpoint restricted to admin/server-only
- [x] Health endpoint split: public health.ping (ok:true) vs authenticated health.database/health.all

### P1 — Reliability & Data Integrity
- [x] Randomized S3 keys using nanoid + user-scoped paths (no original filename in key)
- [x] Add ownerUserId + createdByUserId + visibility fields to documents table
- [x] Add DB indexes for foreign-key columns (documentId, pageId, ocrResultId, userId, providerId)
- [x] Global JSON/urlencoded body limit reduced from 50mb to 1mb
- [x] Production port: disable auto-fallback when NODE_ENV=production
- [x] Secret masking: store keyPrefix/keySuffix/keyLength at write time; avoid decrypting for list views

### Documentation
- [x] Write README.md (setup, env vars, pipeline architecture, security assumptions)
- [x] Write .env.example with all required variables
- [x] Update Tome of Knowledge page with pipeline API integration guide
- [ ] Add GitHub Actions CI workflow (.github/workflows/ci.yml)

### Tests
- [x] Test: upload rejects unauthenticated before reading file body
- [x] Test: PDF magic-byte validation rejects non-PDF
- [x] Test: prompt mutations blocked for non-admin
- [x] Test: telemetry record blocked for non-admin
- [x] Test: crypto round-trip, hint storage, masked display
- [x] Test: health.ping public, health.database/all require auth
- [x] All 123 tests passing
- [ ] Test: document list scoped by ownership

## Phase: Collapsible Sidebar

- [x] Add collapse/expand toggle button to sidebar (PanelLeftClose/PanelLeftOpen icons)
- [x] Implement icon-only mode when sidebar is collapsed (icons + tooltips on hover)
- [x] Persist collapsed state in localStorage (key: ttrpg-sidebar-collapsed)
- [x] Ensure main content area expands to fill available space when sidebar is collapsed
- [x] Sub-menu items (Inner Sanctum) flatten to icon-only strip in collapsed mode

## Phase: Pipeline Relationship Visualization

- [x] Install React Flow (@xyflow/react) for interactive node/edge diagrams
- [x] Add tRPC procedure: assignments.topology (admin-only, returns stages with assignments + provider names)
- [x] Build PipelineVisualization component with stage nodes, provider nodes, and assignment edges
- [x] Integrate PipelineVisualization as a "Pipeline Map" tab in TheArtificers page
- [x] Style nodes by stage type (layout, OCR, tabular, classification, embedding, enrichment, etc.)
- [x] Show provider name, model, priority, and active status on each assignment node
- [x] Show priority-ordered edges from stage nodes to provider/model nodes
- [x] Write vitest tests for assignments.topology procedure (4 tests, 127 total passing)

## Phase: Pipeline Architecture Redesign (Remove n8n, Full Spec Implementation)

### Schema Changes
- [x] Remove n8n references from PIPELINE_STAGES enum and replace with full revised stage list
- [x] Add systemPrompt (text) and temperature (float) fields to modelAssignments table
- [x] Add llmSettingsJson (json) field to modelAssignments for additional per-stage LLM settings
- [x] Expand documents table: add documentType (book/periodical), scannedName, documentSummary, gameVersion fields
- [x] Expand documentPages table: add rawPngUrl, preprocessedPngUrl, layoutType, contentRegions (json), continuityFlags (json), pageJsonOutput (json), phaseStatus fields
- [x] Add pipelineJobs table: tracks per-document pipeline execution with phase/stage progress and retry counts
- [x] Add pageProcessingAttempts table: tracks each pass (1-4) per page with model used, output, score
- [x] Update ingestionJobs status enum to match new phase structure (phase1_non_ocr, phase2_ocr, phase3_storage)
- [x] Update ocrResults table: add passNumber, attemptScore, comparisonNotes, cloudModelUsed fields
- [x] Run pnpm db:push after all schema changes

### Server Changes
- [x] Update db.ts helpers for new tables and fields
- [x] Add tRPC procedures for pipeline job management (create job, update phase, get job status)
- [x] Add tRPC procedures for page attempt tracking (record attempt, get all attempts for page)
- [x] Update assignments procedures to handle systemPrompt and temperature fields
- [x] Update topology procedure to include systemPrompt/temperature in returned data
- [x] Remove any n8n references from routers.ts and docs

### UI Changes (The Artificers / Assignments)
- [x] Add systemPrompt textarea field to Create Assignment dialog
- [x] Add temperature slider/input field to Create Assignment dialog  
- [x] Add llmSettings (JSON) field to Create Assignment dialog for advanced settings
- [x] Show system prompt preview (truncated) in assignment list rows
- [x] Add Edit Assignment dialog with same systemPrompt/temperature/settings fields
- [x] Update pipeline stage dropdown to use new stage names

### UI Changes (Pipeline Map)
- [x] Update stage node labels to match new pipeline stage names
- [x] Reorganize nodes into Phase 1 (non-OCR), Phase 2 (OCR), Phase 3 (storage) visual groupings
- [x] Show system prompt indicator on assignment nodes (icon if prompt is set)
- [x] Update edge colors/styles to reflect phase groupings
- [x] Add HITL escalation node and dashed fallback/conditional edges
- [x] Add phase legend overlay

### UI Changes (Tome of Knowledge)
- [x] Remove all n8n references from documentation
- [x] Document new Python-based pipeline phases (Phase 1, 2, 3)
- [x] Document per-stage system prompt and temperature configuration
- [x] Document the multi-pass retry/escalation logic (passes 1-4 + HITL)
- [x] Document the structured JSON output format per page
- [x] Document the dual PNG preservation strategy (rawPngUrl + preprocessedPngUrl)

### UI Changes (Incantations & Runes)
- [x] Update PROMPT_TABS to reflect new pipeline stages (P1: layout_analysis, bbox_detection; P2: ocr_extraction, content_break_detect, summarisation, quality_validation, pass_comparison)

### Tests
- [x] Update existing assignment tests to include systemPrompt/temperature fields
- [x] Add tests for pipeline job management procedures
- [x] Add tests for page attempt tracking procedures
- [x] All 127 tests passing after schema and router changes

## Phase: Provider Registry + Stage Inscriptions Redesign (Stale — superseded by later phase below)

### Schema Changes
- [x] Enhance llmProviders table: add displayName, modelId, port, contextLength, maxTokens, defaultTemperature, capabilities, isDefault fields
- [x] Create stageInscriptions table: stage (unique), primaryProviderId, fallbackProviderId, systemPrompt, temperature, maxTokens, llmSettings, isActive
- [x] Remove modelAssignments table (replaced by stageInscriptions)
- [x] Run pnpm db:push after schema changes

### Server Changes
- [x] Update db.ts: add stageInscriptions helpers (upsert, list, getByStage), update llmProviders helpers for new fields
- [x] Update routers.ts: replace assignments.* procedures with inscriptions.* procedures (list, upsert, getByStage, delete)
- [x] Update providers.* procedures to handle new fields (displayName, modelId, port, capabilities, isDefault, defaultTemperature)
- [x] Remove all modelAssignments references from routers.ts and db.ts

### UI Changes (The Artificers)
- [x] Replace "Model Assignments" tab with "Stage Inscriptions" tab
- [x] Build Stage Inscriptions UI: one row per pipeline stage, primary + fallback provider pickers, system prompt, temperature, maxTokens
- [x] Enhance Provider Registry UI: add displayName, modelId, port, contextLength, maxTokens, defaultTemperature, capabilities, isDefault fields
- [x] Add "Test Connection" button per provider (sends a real ping to verify connectivity)
- [x] Show provider type icon and model ID in inscription provider pickers

### Tests
- [x] Update providers.test.ts for new llmProviders fields
- [x] Add inscriptions.test.ts for stageInscriptions CRUD procedures
- [x] Remove/replace modelAssignments tests

### GitHub
- [x] Push all changes to GitHub after checkpoint

## Phase: Provider Registry + Stage Inscriptions Redesign

- [x] Analyse orchestra-sdk and orchestra-dashboard repos for provider/assignment patterns
- [x] Design new schema: enhanced llmProviders + stageInscriptions (replaces modelAssignments)
- [x] Add displayName, port, modelId, contextLength, maxTokens, defaultTemperature, capabilities, isDefault to llmProviders
- [x] Create stageInscriptions table: stage (unique), primaryProviderId, fallbackProviderId, systemPrompt, temperature, maxTokens, llmSettings, isActive
- [x] Drop modelAssignments table
- [x] Apply DB migration (db:push + manual ALTER TABLE for MySQL JSON column compatibility)
- [x] Update db.ts helpers: getAllStageInscriptions, getStageInscriptionByStage, upsertStageInscription, updateStageInscription, deleteStageInscription
- [x] Update routers.ts: assignments.list, byStage, upsert, update, delete, stages, topology — all using new inscription shape
- [x] Update providers.create/update input to include new fields (displayName, modelId, port, etc.)
- [x] Rewrite TheAssignments.tsx: one row per stage, primary/fallback provider pickers, inline prompt/temperature/maxTokens editing
- [x] Update TheArtificers.tsx: new provider fields in Create/Edit dialogs
- [x] Update PipelineVisualization.tsx: TopologyStage uses inscription+primaryProvider+fallbackProvider shape
- [x] Update providers.test.ts: add displayName to all providers.create calls, replace assignments.create with assignments.upsert
- [x] Update features.test.ts: topology tests use new inscription+provider shape
- [x] All 128 tests passing
- [x] Push to GitHub

## Phase: Model Discovery + Provider CRUD

- [x] Research OpenRouter, OpenAI, Anthropic model list APIs and vision capability metadata
- [x] Build server tRPC procedure: providers.discoverModels (providerType, apiKey, baseUrl, port, visionOnly) — unified for cloud and local
- [x] Local model discovery: tries OpenAI /v1/models format (works for LMStudio, vLLM, Ollama)
- [x] Cloud model discovery: OpenRouter (public endpoint, no key needed), Anthropic (x-api-key), OpenAI (Bearer)
- [x] Vision-only filter: OpenRouter uses architecture.input_modalities, local uses model name heuristics
- [x] Auto-fill contextLength, maxTokens, capabilities from discovered model metadata
- [x] Rewrite TheArtificers.tsx: fully functional add/edit/disable/delete provider actions
- [x] Add model picker dropdown with live discovery (Discover button triggers API call, populates dropdown)
- [x] Auto-fill contextLength and maxTokens when a model is selected from the discovered list
- [x] Card-level Discover button: shows inline model list with vision filter and search on each provider card
- [x] Auto-cache discovered models to provider.availableModels
- [x] Trim DB provider entries to 2 (LM Studio Local Vision + OpenRouter Cloud Fallback)
- [x] All 128 tests passing
- [x] Push to GitHub

## Phase: Provider URL Decomposition + Capability Flags

- [x] Add apiPrefix column to llmProviders table (e.g. "/v1")
- [x] Replace capabilities JSON column with boolean flags: supportsChat, supportsVision, supportsEmbedding
- [x] Apply DB migration for new columns
- [x] Update db.ts helpers for new fields
- [x] Update providers.create/update input schemas in routers.ts
- [x] Fix URL assembly in discoverModels and testConnection to avoid duplicate port/prefix
- [x] Rewrite TheArtificers provider form: separate baseUrl, port, apiPrefix fields
- [x] Smart URL decomposition on paste: parse "http://10.x.x.x:1234/v1" into host/port/prefix
- [x] Replace capabilities text input with Chat / Vision / Embedding checkboxes
- [x] Update provider card display to show flag badges instead of capability string
- [x] Update providers.test.ts for new schema fields
- [x] Push to GitHub

## Phase: Capability Flags Reorder + Reasoning Toggle

- [x] Add supportsReasoning boolean column to llm_providers schema
- [x] Add supportsReasoning to providers.create and providers.update input schemas in routers.ts
- [x] Move capability flags (Chat, Vision, Embedding) directly below Display Name + Model ID in ProviderFormFields
- [x] Add Reasoning toggle (on/off switch) alongside the other capability flags
- [x] Remove legacy Vision-only filter button from ModelPicker discovery UI (replace with capability badges)
- [x] Update provider card display to show Reasoning badge alongside Chat/Vision/Embedding
- [x] Apply DB migration for supportsReasoning column
- [x] Run all tests and fix any failures
- [x] Save checkpoint and push to GitHub

## Phase: Remaining Work (Confirmed Outstanding)

### CI / DevOps
- [ ] Add GitHub Actions CI workflow (.github/workflows/ci.yml) — runs `pnpm test` on push/PR to main

### Tests
- [ ] Test: document list scoped by ownership (listDocuments returns only docs where ownerUserId = ctx.user.id or visibility = 'global')

### Health Endpoints
- [x] health.all — scribes: replace hardcoded stub with real `getActiveIngestionJobs()` count (done)
- [ ] health.all — agents: replace hardcoded stub once LM Studio health endpoint is defined (needs real service endpoint)
- [ ] health.all — cloudConduit: replace hardcoded stub once OpenRouter connectivity check is implemented (needs real ping)

### Document Ownership
- [ ] listDocuments: add ownership filter at DB level (WHERE ownerUserId = ? OR visibility = 'global') instead of JS post-filter
- [ ] searchDocuments: same — push ownership filter into the SQL WHERE clause for correctness and performance

### Invitations
- [ ] Email dispatch for invitation scrolls — invitations are created in DB but never sent (needs email service integration, e.g. Resend or SMTP)

## Phase: Assignments → Prompt Reference (not inline text)

- [x] Schema: rename `systemPrompt` column to `promptName` (varchar 128, nullable FK reference to system_prompts.name) in stage_inscriptions
- [x] Apply DB migration for column rename
- [x] db.ts: update upsertStageInscription / updateStageInscription helpers to use promptName
- [x] routers.ts: update assignments.upsert and assignments.update input schemas (promptName: z.string().optional() instead of systemPrompt)
- [x] routers.ts: update assignments.topology to return promptName (and optionally resolve the full promptText by joining system_prompts)
- [x] TheAssignments.tsx: replace systemPrompt textarea with a Select dropdown populated from prompts.list (filtered to category="pipeline")
- [x] TheAssignments.tsx: show the selected prompt's description as helper text below the picker
- [x] TheAssignments.tsx: add a "Edit Prompts" link that navigates to Incantations & Runes
- [x] Update providers.test.ts and features.test.ts: replace systemPrompt field with promptName in all test fixtures
- [x] All 128 tests passing after changes
- [x] Save checkpoint and push to GitHub

## Phase: Add Missing Pipeline Stages to Incantations & Runes + Pipeline Visualization

- [x] Add `document_intelligence` tab to PROMPT_TABS in IncantationsRunes.tsx (Phase 1, pipeline category)
- [x] Add `content_type_classify` tab to PROMPT_TABS in IncantationsRunes.tsx (Phase 1, pipeline category)
- [x] Add `tabular_extraction` tab to PROMPT_TABS in IncantationsRunes.tsx (Phase 2, pipeline category)
- [x] Add `referee` tab to PROMPT_TABS in IncantationsRunes.tsx (console_experience category)
- [x] Verify `summarisation` tab is present and correctly named
- [x] Verify `quality_validation` and `pass_comparison` tabs are present
- [x] Add document_intelligence, tabular_extraction, pass_comparison, and referee to PipelineVisualization.tsx STAGE_META, PIPELINE_FLOW, and FLOW_EDGES
- [x] Extend ramblings.generate test timeout to 15s (LLM call)
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Default Prompts Seeding + Version History

- [x] Replace seedDefaultPrompts defaults array with all 13 canonical prompts from ttrpg_default_prompts.md
- [x] Add `prompt_versions` table to schema (promptName, promptText, version, savedBy, createdAt)
- [x] Apply DB migration for prompt_versions table (CREATE TABLE IF NOT EXISTS via Node.js)
- [x] Update upsertSystemPrompt in db.ts to auto-increment version, write version history row, and trim to last 3 versions
- [x] Add getPromptVersionHistory helper in db.ts (returns last 3 versions ordered by version DESC)
- [x] Update seedDefaultPrompts loop to also write initial version history rows for new prompts
- [x] Add prompts.history tRPC procedure in routers.ts (protectedProcedure, input: name)
- [x] Pass ctx.user.id to upsertSystemPrompt in prompts.upsert mutation (tracks who saved each version)
- [x] Add Version History panel to IncantationsRunes.tsx (shows last 3 saves with version badge, timestamp, char count; Restore button loads old version into editor)
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Three Recommendations Implementation

- [x] Wire Scribes health stub: replace hardcoded "Idle — No Active Jobs" in health.all with real getActiveIngestionJobs() count
- [x] Update Scribes orb status text to reflect actual job count (e.g. "3 Active Jobs" vs "Idle — No Active Jobs")
- [x] `tabular_extraction` and `referee` already in PIPELINE_STAGES array (varchar column, no migration needed)
- [x] Seed all 13 default prompts into the live DB via scripts/seed-prompts.mjs
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: InscriptionDialog Refactor — Auto-Assign Incantation + Version Picker

- [x] Auto-assign Incantation (promptName) from stage name — no manual prompt picker needed
- [x] Show Incantation name as read-only display field with current version badge
- [x] Add Version picker: only shown when multiple versions exist for the stage's prompt (from prompts.history)
- [x] Keep Primary Provider, Fallback Provider, Temperature, Max Tokens, Active Inscription fields
- [x] Fix dialog overflow for long provider names (truncate/wrap provider name in Select trigger)
- [x] Add prompts.history tRPC call inside dialog to populate version options
- [x] promptName auto-set to stage name on save (no user selection required)
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Assignments Stage Type Split + Friendly Labels

- [x] Add NON_LLM_STAGES set — classify each stage as LLM or non-LLM
- [x] Incantation badge in stage card shows friendly label (e.g. "Document Intelligence") not snake_case via toFriendlyLabel()
- [x] Non-LLM stages: route to StageSettingsDialog — no provider pickers, no temperature/tokens
- [x] StageSettingsDialog for pdf_to_png: Max PNG Size (px), DPI, Binarization toggle
- [x] StageSettingsDialog for document_registration: Duplicate Hash Threshold
- [x] StageSettingsDialog for child_image_extraction: Min Image Area (px²), Max Images Per Page
- [x] StageSettingsDialog for artifact_storage / database_load / embedding_generation: read-only info panel
- [x] Stage cards for non-LLM stages: Wrench Configure button, no delete button, appropriate empty-state text
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Provider Registry Cleanup — Real Providers Only

- [x] Delete all dummy/seed provider rows from the DB (13 dummy rows removed)
- [x] Updated Asus - Nano Omni provider (OpenAI Compatible, 10.116.2.56:8100/v1, all caps on, default temp 0.3, context 65536, maxTokens 36864, model nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-NVFP4, isDefault true)
- [x] Updated Framework — Local provider (LM Studio, 10.116.2.145:1234/v1, all caps on, default temp 0.2, context 8192, model nvidia/nemotron-3-nano-omni, isDefault false)
- [x] Fixed providers.test.ts: added cleanup (delete) after "create" and "masks API keys" tests to prevent orphan rows on future test runs
- [x] No seedDefaultProviders for providers — providers are user-managed only
- [x] 128/128 tests passing, DB confirmed at exactly 2 providers after test run
- [x] Save checkpoint and push to GitHub

## Phase: UI Fixes — Dialog Resize + Sidebar Collapse

- [x] InscriptionDialog: dynamic width up to 50% wider based on content (long provider names / model IDs clip)
- [x] InscriptionDialog: Incantation badge shows snake_case — show friendly label instead (toFriendlyLabel() already applied)
- [x] InscriptionDialog: "v1 cu" version badge is clipped — ensure it fits within the badge area (wider dialog resolves clipping)
- [x] DashboardLayout: sidebar collapse/hide toggle — changed collapsible="icon" to collapsible="offcanvas" (full hide); added persistent toggle button in desktop top bar
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Stage Count Fix + Sidebar Boundary Arrow

- [x] Stage Inscriptions: filter PIPELINE_STAGES to only mapped stages (remove legacy aliases + console stages from count)
- [x] Stage Inscriptions: non-LLM stages (artifact_storage, embedding_generation, database_load, document_registration, pdf_to_png, child_image_extraction) count as auto-configured — no DB inscription required
- [x] Stage Inscriptions: per-phase badge and global counter now show "configured" not "inscribed"
- [x] Stage Inscriptions: non-LLM stage rows show "Auto-configured" badge (blue) instead of "Not inscribed"
- [x] Stage Inscriptions: non-LLM stage description text updated to "Runs automatically. Click Configure to adjust optional parameters."
- [x] DashboardLayout: replaced top-bar PanelLeft toggle with floating boundary arrow button on the sidebar right edge
- [x] Floating arrow points LEFT (collapse) when sidebar is open, RIGHT (expand) when sidebar is hidden
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: InscriptionDialog Overflow + Vault Nexus Cleanup + Docker Guide

- [x] InscriptionDialog: SelectTrigger now shows provider name on line 1, model ID (mono, truncated) on line 2 — no more single-line overflow clipping
- [x] TheVaultNexus: redesigned card to show only primary config (name, type, host:port/db, active status) by default; secondary details (SSL, test status, credentials, notes) hidden behind a chevron expand
- [x] TheVaultNexus: removed always-visible Security Notice card (now implicit in description)
- [x] Dockerfile: multi-stage build (builder + runner) using Node 22 Alpine
- [x] .dockerignore: added to keep image lean
- [x] docker-compose.yml: Portainer-ready stack with bundled MySQL 8 service, all env vars documented
- [x] DOCKER_DEPLOY.md: full deployment guide covering CLI, Portainer stack, env vars, migration, update, rollback, backup, and troubleshooting
- [x] 128/128 tests passing
- [x] Save checkpoint and push to GitHub

## Phase: Vault Nexus Cleanup + Sidebar Arrow + Title Fix

- [x] Vault Nexus: delete dummy "Test Connection Ping" rows seeded by unit tests from the live DB (121 orphaned rows deleted)
- [x] Vault Nexus: added afterAll cleanup to connections describe block in providers.test.ts
- [x] DashboardLayout: floating boundary arrow chevron — moved to Layout.tsx (the actual layout used by the app); ChevronLeft/Right button sits at -right-3 on the sidebar boundary
- [x] DashboardLayout: "Evos' Infinite Kodex" title — changed truncate to whitespace-nowrap; widened sidebar from w-64 to w-72 to give the title room

## Phase: Deploy Script + env.example

- [x] Clarify MySQL vs Postgres: console uses MySQL 8 (Drizzle mysql2 driver); Supabase/Postgres is the separate pipeline DB
- [x] Write env.example with full annotations for all variables
- [x] Write deploy.sh: validates .env, pulls latest code, waits for MySQL health, runs pnpm db:push migrations, rebuilds console container
- [x] deploy.sh supports --skip-pull, --skip-migrate, --down, --reset-db flags
- [x] deploy.sh falls back to running migrations inside a temp container if pnpm is not on the host

## Phase: GitHub Actions Release Workflow + Portainer Stack

- [x] Add .github/workflows/release.yml — build and push Docker image to GHCR on push to main
- [x] Add portainer-stack.yml — Portainer-ready stack file using ghcr.io pre-built image
- [x] Update DOCKER_DEPLOY.md to document the new workflow and Portainer stack usage

## Phase: Fix GitHub Actions Build Failure

- [x] Fix Dockerfile: pnpm install --frozen-lockfile fails in multi-platform CI build — pinned pnpm@10.4.1 via corepack (was pnpm@10 which resolved to a newer incompatible version)
- [x] Fix release.yml: added actions/setup-node@v4 with Node 22 in test job; added full test job with MySQL service before build; PNPM_VERSION env var pinned to 10.4.1
- [x] Fix CI test failure: ramblings.generate called real Manus Forge API (BUILT_IN_FORGE_API_KEY not available in CI) — added vi.mock('./_core/llm') in features.test.ts to mock invokeLLM; test now runs in ~400ms instead of 5.7s
- [x] Fix Dockerfile: corepack prepare pnpm@10.4.1 fails in QEMU-emulated arm64 multi-platform build — replaced with npm install -g pnpm@10.4.1 (deterministic, no network resolution)
