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

- [ ] Add llm_providers table to drizzle schema (name, type, baseUrl, encryptedApiKey, isActive)
- [ ] Add model_assignments table to drizzle schema (providerId, modelName, pipelineStage, priority)
- [ ] Add db_connections table to drizzle schema (name, type, host, port, database, encryptedCredentials, isActive)
- [ ] Build tRPC procedures for provider CRUD with encrypted API key storage
- [ ] Build tRPC procedures for model assignment matrix (assign/unassign models to stages)
- [ ] Build tRPC procedures for database connection management with connection testing
- [ ] Build LLM Provider Registry UI page (The Artificers)
- [ ] Build Model Assignment Matrix UI page (The Assignments)
- [ ] Build Database Connection Config UI page (The Vault Nexus)
- [ ] Update Layout.tsx to add new pages to The Inner Sanctum submenu
- [ ] Write vitest tests for provider, assignment, and connection procedures
