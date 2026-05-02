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
