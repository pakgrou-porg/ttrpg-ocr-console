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
