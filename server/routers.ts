import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  getUserProfile, upsertUserProfile,
  getAllSystemPrompts, getSystemPromptByName, upsertSystemPrompt, seedDefaultPrompts, getPromptVersionHistory,
  getAllUsers, getUserById, updateUserRole,
  getUserPermissions, setUserPermission, deleteUserPermission, getAllPermissionsForAllUsers,
  createInvitation, getAllInvitations, revokeInvitation,
  getAllSystemConfig, getSystemConfigByCategory, upsertSystemConfig, deleteSystemConfig,
  getAllIngestionJobs, getActiveIngestionJobs, getIngestionJobById, createIngestionJob, updateIngestionJobStatus, getIngestionJobStats, deleteIngestionJob, clearIngestionJobsByStatus, cancelIngestionJobChain, purgeJobPages, clearHitlItems,
  recordTelemetryEvent, getTelemetryEvents, getTelemetrySummary,
  pingDatabase,
  getAllLlmProviders, getLlmProviderById, createLlmProvider, updateLlmProvider, deleteLlmProvider,
  getAllStageInscriptions, getStageInscriptionByStage, upsertStageInscription, updateStageInscription, deleteStageInscription,
  getAllSupabaseInstances, getSupabaseInstanceById, createSupabaseInstance, updateSupabaseInstance, deleteSupabaseInstance, setActiveSupabaseInstance, testSupabaseInstanceConnection,
  getDocumentById, getAllDocuments, createDocument, updateDocument, deleteDocument, searchDocuments,
  getPagesByDocumentId, getPageById, getPageByPhash, createDocumentPage, updateDocumentPage,
  getPagesByIds, getDocumentsByIds, getOcrResultsByPageIds,
  getOcrResultByPageId, getOcrResultById, createOcrResult, updateOcrResult,
  getHitlItemById, getHitlItemsByIds, getHitlItemsByPageId, getAllHitlItems, createHitlItem, updateHitlItem, getHitlStats,
  getAllGameSystems, createGameSystem, updateGameSystem, deleteGameSystem,
} from "./db";
import { encryptSecret, decryptSecret, storeSecretHint, renderMaskedSecret } from "./crypto";
import { startJob } from "./pipeline/runner";
import { ENV } from "./_core/env";
import { FEATURE_AREAS, PROVIDER_TYPES, PIPELINE_STAGES, SUPABASE_CONNECTION_TYPES, SUPABASE_ROLES, SUPABASE_SYNC_MODES, DOCUMENT_STATUSES, OCR_RESULT_STATUSES, HITL_PRIORITIES, HITL_STATUSES } from "../drizzle/schema";

/** Admin-only guard — throws FORBIDDEN if the caller is not an admin. */
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "The Conclave is for administrators only." });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),  // ─── Health Checks ───────────────────────────────────────────────────────────
  health: router({
    // P1: Public liveness probe — returns only { ok: true } with no internal detail.
    // Use this for load balancer / uptime monitor checks.
    // Example: GET /api/trpc/health.ping
    ping: publicProcedure.query(() => ({ ok: true })),

    // P1: Detailed DB health is behind authentication — exposes latency and
    // connection details that should not be visible to unauthenticated callers.
    database: protectedProcedure.query(async () => {
      return pingDatabase();
    }),

    // P1: Full service status is behind authentication — exposes service topology.
    all: protectedProcedure.query(async () => {
      const [dbResult, activeJobs] = await Promise.all([
        pingDatabase(),
        getActiveIngestionJobs(),
      ]);
      const jobCount = activeJobs.length;
      const scribesDetail = jobCount === 0
        ? "Idle — No Active Jobs"
        : `${jobCount} Active Job${jobCount === 1 ? "" : "s"}`;
      return {
        database: dbResult,
        agents: { ok: true, latencyMs: 0, detail: "Available & Ready" },
        scribes: { ok: jobCount === 0, latencyMs: 0, detail: scribesDetail },
        cloudConduit: { ok: true, latencyMs: 0, detail: "OpenRouter Active" },
      };
    }),
  }),

  // ─── User Profile (self-service) ──────────────────────────────────────────
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserProfile(ctx.user.id);
    }),

    upsert: protectedProcedure
      .input(z.object({
        displayName: z.string().max(128).optional(),
        preferredGame: z.string().max(128).optional(),
        preferredVersion: z.string().max(64).optional(),
        avatarUrl: z.string().max(512).optional(),
        savedEntries: z.array(z.string()).optional(),
        savedGroups: z.array(z.object({
          id: z.string(),
          name: z.string(),
          entries: z.array(z.string()),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserProfile({ userId: ctx.user.id, ...input });
        return { success: true };
      }),
  }),

  // ─── Permissions (for frontend gating) ────────────────────────────────────
  permissions: router({
    /** Get the current user's permissions */
    mine: protectedProcedure.query(async ({ ctx }) => {
      return getUserPermissions(ctx.user.id);
    }),
  }),

  // ─── System Prompts ───────────────────────────────────────────────────────
  prompts: router({
    list: protectedProcedure.query(async () => {
      return getAllSystemPrompts();
    }),

    getByName: protectedProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        return getSystemPromptByName(input.name);
      }),

    // P0: Prompt mutations are admin-only — any user could otherwise overwrite
    // pipeline prompts and inject malicious instructions into the OCR pipeline.
    upsert: adminProcedure
      .input(z.object({
        name: z.string().max(128),
        category: z.enum(["pipeline", "console_experience"]),
        description: z.string().optional(),
        promptText: z.string(),
        version: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        await upsertSystemPrompt(input, ctx.user.id);
        return { success: true };
      }),

    /** Returns the last 3 saved versions of a prompt for history/rollback */
    history: protectedProcedure
      .input(z.object({ name: z.string() }))
      .query(async ({ input }) => {
        return getPromptVersionHistory(input.name);
      }),

    // P0: Seeding defaults is destructive — admin-only
    seedDefaults: adminProcedure.mutation(async () => {
      await seedDefaultPrompts();
      return { success: true };
    }),
  }),

  // ─── Listen to Ramblings (LLM-powered) ────────────────────────────────────
  ramblings: router({
    /** Generate a random lore rambling using the voice_of_arkanum prompt */
    generate: protectedProcedure
      .input(z.object({
        topic: z.string().max(256).optional(),
      }).optional())
      .mutation(async ({ input }) => {
        // Fetch the voice_of_arkanum prompt from the database
        const prompt = await getSystemPromptByName("voice_of_arkanum");
        const systemPromptText = prompt?.promptText ?? "You are a wise lore keeper. Share an interesting piece of TTRPG lore in 2-4 sentences.";

        const userMessage = input?.topic
          ? `Please ramble about: ${input.topic}`
          : "Share a random piece of lore from your vast knowledge.";

        try {
          const result = await invokeLLM({
            messages: [
              { role: "system", content: systemPromptText },
              { role: "user", content: userMessage },
            ],
            maxTokens: 300,
          });

          const content = result.choices?.[0]?.message?.content;
          const text = typeof content === "string" ? content : Array.isArray(content) ? content.map(c => c.type === "text" ? c.text : "").join("") : "";

          // Record telemetry for this LLM call
          await recordTelemetryEvent({
            eventType: "llm_call",
            source: "voice_of_arkanum",
            metricValue: result.usage?.total_tokens ?? 0,
            costMicros: 0, // Built-in LLM is free
            metadata: { model: result.model, promptTokens: result.usage?.prompt_tokens, completionTokens: result.usage?.completion_tokens },
          });

          return { text, model: result.model, tokens: result.usage?.total_tokens ?? 0 };
        } catch (error: any) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `The Voice of the Arkanum is silent: ${error.message}`,
          });
        }
      }),
  }),

  // ─── System Config (Arcane Mechanisms persistence) ─────────────────────────
  config: router({
    /** Get all config entries */
    list: adminProcedure.query(async () => {
      return getAllSystemConfig();
    }),

    /** Get config entries by category (e.g., "supabase", "lm_studio", "openrouter") */
    byCategory: adminProcedure
      .input(z.object({ category: z.string() }))
      .query(async ({ input }) => {
        return getSystemConfigByCategory(input.category);
      }),

    /** Upsert a config key-value pair */
    set: adminProcedure
      .input(z.object({
        key: z.string().max(128),
        value: z.string(),
        category: z.string().max(64),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertSystemConfig({
          key: input.key,
          value: input.value,
          category: input.category,
          updatedBy: ctx.user.id,
        });
        return { success: true };
      }),

    /** Delete a config key */
    delete: adminProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ input }) => {
        await deleteSystemConfig(input.key);
        return { success: true };
      }),
  }),

  // ─── Ingestion Jobs (Oversee the Scribes) ──────────────────────────────────
  jobs: router({
    /** List all jobs (most recent first) */
    list: protectedProcedure.query(async () => {
      return getAllIngestionJobs();
    }),

    /** List only active (in-progress) jobs */
    active: protectedProcedure.query(async () => {
      return getActiveIngestionJobs();
    }),

    /** Get a single job by ID */
    get: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const job = await getIngestionJobById(input.id);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
        return job;
      }),

    /** Get aggregate stats for the dashboard */
    stats: protectedProcedure.query(async () => {
      return getIngestionJobStats();
    }),

    /** Create a new ingestion job and start the pipeline */
    create: adminProcedure
      .input(z.object({
        sourceFile: z.string().max(512),
        gameSystem: z.string().max(128).optional(),
        storageProvider: z.enum(["local", "google_drive"]).default("local"),
        driveFileId: z.string().max(512).optional(),
        pageOffset: z.number().int().min(0).default(0),
        blockSize: z.number().int().min(1).max(50).default(10),
      }))
      .mutation(async ({ input }) => {
        const id = await createIngestionJob({
          sourceFile: input.sourceFile,
          gameSystem: input.gameSystem,
          storageProvider: input.storageProvider,
          driveFileId: input.driveFileId,
          pageOffset: input.pageOffset,
          blockSize: input.blockSize,
        } as any);
        startJob(id);
        return { success: true, id };
      }),

    /** Delete a single job by ID */
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteIngestionJob(input.id);
        return { success: true };
      }),

    /** Clear all jobs with the given statuses */
    clear: adminProcedure
      .input(z.object({ statuses: z.array(z.string()).min(1) }))
      .mutation(async ({ input }) => {
        await clearIngestionJobsByStatus(input.statuses);
        return { success: true };
      }),

    /** Delete all pages, OCR results, and HITL items for a job's document */
    purgePages: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await purgeJobPages(input.id);
        return { success: true };
      }),

    /** Cancel a job and all pending follow-on blocks with the same sourceFile */
    cancel: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const job = await getIngestionJobById(input.id);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found." });
        await cancelIngestionJobChain(job.sourceFile, (job as any).driveFileId ?? null);
        return { success: true };
      }),

    /** Update job status (used by pipeline workers) */
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(["queued", "converting", "pass1_ocr", "pass2_ocr", "enriching", "review", "completed", "failed"]).optional(),
        processedPages: z.number().int().optional(),
        flaggedPages: z.number().int().optional(),
        avgConfidence: z.number().int().optional(),
        errorMessage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        const updateData: Record<string, unknown> = {};
        if (updates.status) updateData.status = updates.status;
        if (updates.processedPages !== undefined) updateData.processedPages = updates.processedPages;
        if (updates.flaggedPages !== undefined) updateData.flaggedPages = updates.flaggedPages;
        if (updates.avgConfidence !== undefined) updateData.avgConfidence = updates.avgConfidence;
        if (updates.errorMessage !== undefined) updateData.errorMessage = updates.errorMessage;
        if (updates.status === "completed") updateData.completedAt = new Date();
        if (updates.status && updates.status !== "queued" && updates.status !== "completed" && updates.status !== "failed") {
          updateData.startedAt = new Date();
        }
        await updateIngestionJobStatus(id, updateData as any);
        return { success: true };
      }),
  }),

  // ─── Telemetry (Divination & Omens) ────────────────────────────────────────
  telemetry: router({
    // P0: Telemetry writes are admin-only — any user could otherwise flood the
    // telemetry table with fake events, skewing cost/usage metrics.
    // The pipeline (which runs server-side) calls this via adminProcedure context.
    record: adminProcedure
      .input(z.object({
        eventType: z.string().max(64),
        source: z.string().max(128),
        metricValue: z.number().int().optional(),
        costMicros: z.number().int().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ input }) => {
        await recordTelemetryEvent(input);
        return { success: true };
      }),

    /** Get telemetry events with optional filters */
    events: protectedProcedure
      .input(z.object({
        eventType: z.string().optional(),
        source: z.string().optional(),
        sinceDays: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      }).optional())
      .query(async ({ input }) => {
        const since = input?.sinceDays ? new Date(Date.now() - input.sinceDays * 86400000) : undefined;
        return getTelemetryEvents({
          eventType: input?.eventType,
          source: input?.source,
          since,
          limit: input?.limit,
        });
      }),

    /** Get aggregated telemetry summary */
    summary: protectedProcedure.query(async () => {
      return getTelemetrySummary();
    }),
  }),

  // ─── Admin: The Conclave ──────────────────────────────────────────────────
  admin: router({
    listUsers: adminProcedure.query(async () => {
      const allUsers = await getAllUsers();
      const allPerms = await getAllPermissionsForAllUsers();
      return allUsers.map(u => ({
        ...u,
        permissions: allPerms.filter(p => p.userId === u.id),
      }));
    }),

    getUser: adminProcedure
      .input(z.object({ userId: z.number().int() }))
      .query(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found in the Arkanum." });
        const permissions = await getUserPermissions(input.userId);
        return { ...user, permissions };
      }),

    setRole: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),

    setPermission: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        featureArea: z.enum(FEATURE_AREAS),
        granted: z.boolean(),
        restrictedGame: z.string().max(128).optional(),
        restrictedVersion: z.string().max(64).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await setUserPermission({
          userId: input.userId,
          featureArea: input.featureArea,
          granted: input.granted,
          restrictedGame: input.restrictedGame,
          restrictedVersion: input.restrictedVersion,
          grantedBy: ctx.user.id,
        });
        return { success: true };
      }),

    removePermission: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        featureArea: z.enum(FEATURE_AREAS),
      }))
      .mutation(async ({ input }) => {
        await deleteUserPermission(input.userId, input.featureArea);
        return { success: true };
      }),

    listInvitations: adminProcedure.query(async () => {
      return getAllInvitations();
    }),

    createInvitation: adminProcedure
      .input(z.object({
        email: z.string().email().max(320),
        displayName: z.string().max(128).optional(),
        role: z.enum(["user", "admin"]).default("user"),
        expiresInDays: z.number().int().min(1).max(90).default(7),
      }))
      .mutation(async ({ ctx, input }) => {
        const token = nanoid(32);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);
        await createInvitation({
          email: input.email,
          displayName: input.displayName,
          role: input.role,
          token,
          createdBy: ctx.user.id,
          expiresAt,
        });
        return { success: true, token, expiresAt };
      }),

    revokeInvitation: adminProcedure
      .input(z.object({ invitationId: z.number().int() }))
      .mutation(async ({ input }) => {
        await revokeInvitation(input.invitationId);
        return { success: true };
      }),

    featureAreas: adminProcedure.query(() => {
      return FEATURE_AREAS.map(area => ({
        id: area,
        label: area
          .split("_")
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" "),
      }));
    }),
  }),

  // ─── LLM Providers (The Artificers) ───────────────────────────────────────
  providers: router({
    /** List all providers (API keys are masked using stored hints — no decryption) */
    list: adminProcedure.query(async () => {
      const providers = await getAllLlmProviders();
      return providers.map(p => ({
        ...p,
        encryptedApiKey: undefined,
        keyIv: undefined,
        keyAuthTag: undefined,
        hasApiKey: !!p.encryptedApiKey,
        // P1: Use stored hint fields to render masked key without decrypting
        maskedApiKey: (p.keyPrefix && p.keySuffix && p.keyLength)
          ? renderMaskedSecret({ keyPrefix: p.keyPrefix, keySuffix: p.keySuffix, keyLength: p.keyLength })
          : (p.encryptedApiKey ? "••••••••" : null),
      }));
    }),

    /** Get a single provider by ID (API key masked using stored hints) */
    get: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const provider = await getLlmProviderById(input.id);
        if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found." });
        return {
          ...provider,
          encryptedApiKey: undefined,
          keyIv: undefined,
          keyAuthTag: undefined,
          hasApiKey: !!provider.encryptedApiKey,
          // P1: Use stored hint fields to render masked key without decrypting
          maskedApiKey: (provider.keyPrefix && provider.keySuffix && provider.keyLength)
            ? renderMaskedSecret({ keyPrefix: provider.keyPrefix, keySuffix: provider.keySuffix, keyLength: provider.keyLength })
            : (provider.encryptedApiKey ? "••••••••" : null),
        };
      }),

    /** Create a new LLM provider */
    /** Create a new LLM provider */
    create: adminProcedure
      .input(z.object({
        displayName: z.string().max(256),
        name: z.string().max(128),
        providerType: z.enum(PROVIDER_TYPES),
        baseUrl: z.string().max(512),
        port: z.number().int().optional(),
        modelId: z.string().max(256).optional(),
        contextLength: z.number().int().optional(),
        maxTokens: z.number().int().optional(),
        defaultTemperature: z.number().min(0).max(2).optional(),
        apiPrefix: z.string().max(64).optional(),
        supportsChat: z.boolean().optional(),
        supportsVision: z.boolean().optional(),
        supportsEmbedding: z.boolean().optional(),
        supportsReasoning: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        apiKey: z.string().optional(),
        notes: z.string().optional(),
        availableModels: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        let encryptedApiKey: string | undefined;
        let keyIv: string | undefined;
        let keyAuthTag: string | undefined;
        let keyPrefix: string | undefined;
        let keySuffix: string | undefined;
        let keyLength: number | undefined;

        if (input.apiKey) {
          const encrypted = encryptSecret(input.apiKey);
          encryptedApiKey = encrypted.ciphertext;
          keyIv = encrypted.iv;
          keyAuthTag = encrypted.authTag;
          const hint = storeSecretHint(input.apiKey);
          keyPrefix = hint.keyPrefix;
          keySuffix = hint.keySuffix;
          keyLength = hint.keyLength;
        }

        // If this is set as default, clear isDefault on all others first
        if (input.isDefault) {
          const allProviders = await getAllLlmProviders();
          for (const p of allProviders) {
            if (p.isDefault) await updateLlmProvider(p.id, { isDefault: false });
          }
        }

        const id = await createLlmProvider({
          displayName: input.displayName,
          name: input.name,
          providerType: input.providerType,
          baseUrl: input.baseUrl,
          port: input.port,
          apiPrefix: input.apiPrefix ?? "/v1",
          modelId: input.modelId,
          contextLength: input.contextLength,
          maxTokens: input.maxTokens,
          defaultTemperature: input.defaultTemperature ?? 0.2,
          supportsChat: input.supportsChat ?? true,
          supportsVision: input.supportsVision ?? false,
          supportsEmbedding: input.supportsEmbedding ?? false,
          supportsReasoning: input.supportsReasoning ?? false,
          isDefault: input.isDefault ?? false,
          encryptedApiKey,
          keyIv,
          keyAuthTag,
          keyPrefix,
          keySuffix,
          keyLength,
          notes: input.notes,
          availableModels: input.availableModels ?? [],
        });
        return { success: true, id };
      }),

    /** Update an existing LLM provider */
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        displayName: z.string().max(256).optional(),
        name: z.string().max(128).optional(),
        providerType: z.enum(PROVIDER_TYPES).optional(),
        baseUrl: z.string().max(512).optional(),
        port: z.number().int().optional(),
        modelId: z.string().max(256).optional(),
        contextLength: z.number().int().optional(),
        maxTokens: z.number().int().optional(),
        defaultTemperature: z.number().min(0).max(2).optional(),
        apiPrefix: z.string().max(64).optional(),
        supportsChat: z.boolean().optional(),
        supportsVision: z.boolean().optional(),
        supportsEmbedding: z.boolean().optional(),
        supportsReasoning: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        apiKey: z.string().optional(),
        clearApiKey: z.boolean().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
        availableModels: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const updates: Record<string, unknown> = {};
        if (input.displayName !== undefined) updates.displayName = input.displayName;
        if (input.name !== undefined) updates.name = input.name;
        if (input.providerType !== undefined) updates.providerType = input.providerType;
        if (input.baseUrl !== undefined) updates.baseUrl = input.baseUrl;
        if (input.port !== undefined) updates.port = input.port;
        if (input.apiPrefix !== undefined) updates.apiPrefix = input.apiPrefix;
        if (input.modelId !== undefined) updates.modelId = input.modelId;
        if (input.contextLength !== undefined) updates.contextLength = input.contextLength;
        if (input.maxTokens !== undefined) updates.maxTokens = input.maxTokens;
        if (input.defaultTemperature !== undefined) updates.defaultTemperature = input.defaultTemperature;
        if (input.supportsChat !== undefined) updates.supportsChat = input.supportsChat;
        if (input.supportsVision !== undefined) updates.supportsVision = input.supportsVision;
        if (input.supportsEmbedding !== undefined) updates.supportsEmbedding = input.supportsEmbedding;
        if (input.supportsReasoning !== undefined) updates.supportsReasoning = input.supportsReasoning;
        if (input.isDefault !== undefined) {
          if (input.isDefault) {
            const allProviders = await getAllLlmProviders();
            for (const p of allProviders) {
              if (p.isDefault && p.id !== input.id) await updateLlmProvider(p.id, { isDefault: false });
            }
          }
          updates.isDefault = input.isDefault;
        }
        if (input.isActive !== undefined) updates.isActive = input.isActive;
        if (input.notes !== undefined) updates.notes = input.notes;
        if (input.availableModels !== undefined) updates.availableModels = input.availableModels;

        if (input.clearApiKey) {
          updates.encryptedApiKey = null;
          updates.keyIv = null;
          updates.keyAuthTag = null;
          updates.keyPrefix = null;
          updates.keySuffix = null;
          updates.keyLength = null;
        } else if (input.apiKey) {
          const encrypted = encryptSecret(input.apiKey);
          updates.encryptedApiKey = encrypted.ciphertext;
          updates.keyIv = encrypted.iv;
          updates.keyAuthTag = encrypted.authTag;
          const hint = storeSecretHint(input.apiKey);
          updates.keyPrefix = hint.keyPrefix;
          updates.keySuffix = hint.keySuffix;
          updates.keyLength = hint.keyLength;
        }

        await updateLlmProvider(input.id, updates as any);
        return { success: true };
      }),

    /** Delete a provider and its model assignments */
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteLlmProvider(input.id);
        return { success: true };
      }),

    /** Test connectivity to a provider */
    test: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const provider = await getLlmProviderById(input.id);
        if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found." });

        const start = Date.now();
        try {
          // Assemble the models endpoint URL without duplicating port or prefix
          // baseUrl should be just the host (e.g. "http://10.x.x.x"), port and apiPrefix are separate
          const host = provider.baseUrl.replace(/\/$/, "");
          const portStr = provider.port ? `:${provider.port}` : "";
          const prefix = (provider.apiPrefix ?? "/v1").replace(/\/$/, "");
          const url = `${host}${portStr}${prefix}/models`;
          const headers: Record<string, string> = { "Content-Type": "application/json" };

          if (provider.encryptedApiKey) {
            try {
              const apiKey = decryptSecret({ ciphertext: provider.encryptedApiKey, iv: provider.keyIv ?? "", authTag: provider.keyAuthTag ?? "" });
              headers["Authorization"] = `Bearer ${apiKey}`;
            } catch {
              return { ok: false, latencyMs: Date.now() - start, error: "Failed to decrypt stored API key. The key may be corrupted or the encryption key may have changed." };
            }
          }

          const response = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10000) });
          const latencyMs = Date.now() - start;

          if (response.ok) {
            const data = await response.json() as any;
            const models = data?.data?.map((m: any) => m.id) ?? [];
            // Update available models cache
            if (models.length > 0) {
              await updateLlmProvider(input.id, { availableModels: models });
            }
            return { ok: true, latencyMs, models };
          } else {
            return { ok: false, latencyMs, error: `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (error: any) {
          return { ok: false, latencyMs: Date.now() - start, error: error.message };
        }
      }),

    /**
     * Discover available models for a provider type.
     * For cloud providers (openrouter, openai, anthropic): hits the provider's models API.
     * For local providers (lmstudio, vllm): hits the OpenAI-compatible /v1/models endpoint.
     * Returns a list of models with contextLength, maxTokens, and vision capability flag.
     * visionOnly=true filters to only models that support image input.
     */
    discoverModels: adminProcedure
      .input(z.object({
        providerType: z.enum(PROVIDER_TYPES),
        apiKey: z.string().optional(),        // for cloud providers
        baseUrl: z.string().optional(),       // for local providers or custom endpoints
        port: z.number().int().optional(),    // for local providers
        apiPrefix: z.string().max(64).optional(), // API path prefix, e.g. "/v1"
        visionOnly: z.boolean().optional(),   // filter to vision-capable models only
        providerId: z.number().int().optional(), // if set, decrypt key from stored provider
      }))
      .mutation(async ({ input }) => {
        let apiKey = input.apiKey;

        // If providerId given, decrypt the stored key
        if (!apiKey && input.providerId) {
          const stored = await getLlmProviderById(input.providerId);
          if (stored?.encryptedApiKey) {
            try {
              apiKey = decryptSecret({ ciphertext: stored.encryptedApiKey, iv: stored.keyIv ?? "", authTag: stored.keyAuthTag ?? "" });
            } catch {
              return { ok: false, error: "Failed to decrypt stored API key.", models: [] };
            }
          }
        }

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        try {
          // ── OpenRouter ──────────────────────────────────────────────────────────
          if (input.providerType === "openrouter") {
            const url = "https://openrouter.ai/api/v1/models";
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
            if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, models: [] };
            const data = await res.json() as any;
            const models = (data?.data ?? []).map((m: any) => {
              const arch = m.architecture ?? {};
              const tp = m.top_provider ?? {};
              const isVision = Array.isArray(arch.input_modalities) && arch.input_modalities.includes("image");
              return {
                id: m.id as string,
                name: m.name as string,
                contextLength: (m.context_length ?? tp.context_length ?? null) as number | null,
                maxTokens: (tp.max_completion_tokens ?? null) as number | null,
                isVision,
                modality: (arch.modality ?? null) as string | null,
                pricingPrompt: m.pricing?.prompt ?? null,
                pricingCompletion: m.pricing?.completion ?? null,
              };
            }).filter((m: any) => !input.visionOnly || m.isVision);
            return { ok: true, models };
          }

          // ── OpenAI (no standalone "openai" type — handled via openai_compatible) ──
          if (input.providerType === "openai_compatible") {
            const host = (input.baseUrl ?? "https://api.openai.com").replace(/\/$/, "");
            const portSuffix = input.port ? `:${input.port}` : "";
            const prefix = (input.apiPrefix ?? "/v1").replace(/\/$/, "");
            const base = `${host}${portSuffix}`;
            const res = await fetch(`${base}${prefix}/models`, { headers, signal: AbortSignal.timeout(15000) });
            if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, models: [] };
            const data = await res.json() as any;
            // OpenAI vision models: gpt-4o, gpt-4-turbo, gpt-4-vision, o4-mini, o3
            const VISION_PATTERNS = ["gpt-4o", "gpt-4-turbo", "gpt-4-vision", "o4-mini", "o3", "gpt-4.1"];
            // Known context lengths for common OpenAI models
            const CONTEXT_MAP: Record<string, number> = {
              "gpt-4o": 128000, "gpt-4o-mini": 128000, "gpt-4-turbo": 128000,
              "gpt-4.1": 1047576, "gpt-4.1-mini": 1047576, "gpt-4.1-nano": 1047576,
              "o3": 200000, "o4-mini": 200000, "o3-mini": 200000,
            };
            const MAX_TOKENS_MAP: Record<string, number> = {
              "gpt-4o": 16384, "gpt-4o-mini": 16384, "gpt-4-turbo": 4096,
              "gpt-4.1": 32768, "gpt-4.1-mini": 32768, "gpt-4.1-nano": 16384,
              "o3": 100000, "o4-mini": 100000,
            };
            const models = (data?.data ?? [])
              .filter((m: any) => m.id.startsWith("gpt-") || m.id.startsWith("o3") || m.id.startsWith("o4"))
              .map((m: any) => {
                const isVision = VISION_PATTERNS.some(p => m.id.includes(p));
                const ctxKey = Object.keys(CONTEXT_MAP).find(k => m.id.startsWith(k));
                const tkKey = Object.keys(MAX_TOKENS_MAP).find(k => m.id.startsWith(k));
                return {
                  id: m.id as string,
                  name: m.id as string,
                  contextLength: ctxKey ? CONTEXT_MAP[ctxKey] : null,
                  maxTokens: tkKey ? MAX_TOKENS_MAP[tkKey] : null,
                  isVision,
                  modality: isVision ? "text+image->text" : "text->text",
                  pricingPrompt: null,
                  pricingCompletion: null,
                };
              }).filter((m: any) => !input.visionOnly || m.isVision);
            return { ok: true, models };
          }

          // ── Anthropic ───────────────────────────────────────────────────────────
          if (input.providerType === "anthropic") {
            const anthropicHeaders: Record<string, string> = { "Content-Type": "application/json", "anthropic-version": "2023-06-01" };
            if (apiKey) { anthropicHeaders["x-api-key"] = apiKey; }
            const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: anthropicHeaders, signal: AbortSignal.timeout(15000) });
            if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, models: [] };
            const data = await res.json() as any;
            // All Claude 3+ models support vision
            const CLAUDE_CONTEXT: Record<string, number> = {
              "claude-opus-4": 200000, "claude-sonnet-4": 200000,
              "claude-3-7-sonnet": 200000, "claude-3-5-sonnet": 200000,
              "claude-3-5-haiku": 200000, "claude-3-opus": 200000,
              "claude-3-haiku": 200000, "claude-3-sonnet": 200000,
            };
            const CLAUDE_MAX_TOKENS: Record<string, number> = {
              "claude-opus-4": 32000, "claude-sonnet-4": 64000,
              "claude-3-7-sonnet": 64000, "claude-3-5-sonnet": 8192,
              "claude-3-5-haiku": 8192, "claude-3-opus": 4096,
              "claude-3-haiku": 4096, "claude-3-sonnet": 4096,
            };
            const models = (data?.data ?? []).map((m: any) => {
              const isVision = m.id.includes("claude-3") || m.id.includes("claude-opus-4") || m.id.includes("claude-sonnet-4");
              const ctxKey = Object.keys(CLAUDE_CONTEXT).find(k => m.id.startsWith(k));
              const tkKey = Object.keys(CLAUDE_MAX_TOKENS).find(k => m.id.startsWith(k));
              return {
                id: m.id as string,
                name: (m.display_name ?? m.id) as string,
                contextLength: ctxKey ? CLAUDE_CONTEXT[ctxKey] : null,
                maxTokens: tkKey ? CLAUDE_MAX_TOKENS[tkKey] : null,
                isVision,
                modality: isVision ? "text+image->text" : "text->text",
                pricingPrompt: null,
                pricingCompletion: null,
              };
            }).filter((m: any) => !input.visionOnly || m.isVision);
            return { ok: true, models };
          }

          // ── LMStudio / vLLM / local OpenAI-compatible ───────────────────────────
          if (["lm_studio", "openai_compatible", "custom"].includes(input.providerType) || input.baseUrl?.startsWith("http://") || input.baseUrl?.startsWith("https://localhost")) {
            // Assemble URL from separate host, port, and prefix parts to avoid duplication
            const rawBase = input.baseUrl ?? `http://localhost`;
            const host = rawBase.replace(/\/$/, "");
            const portStr = input.port ? `:${input.port}` : "";
            // Use apiPrefix from stored provider if providerId given, else from input or default to /v1
            let prefix = "/v1";
            if (input.providerId) {
              const stored = await getLlmProviderById(input.providerId);
              prefix = (stored?.apiPrefix ?? "/v1").replace(/\/$/, "");
            } else if (input.apiPrefix) {
              prefix = input.apiPrefix.replace(/\/$/, "");
            }
            const localUrl = `${host}${portStr}${prefix}/models`;
            const localHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (apiKey) localHeaders["Authorization"] = `Bearer ${apiKey}`;

            const res = await fetch(localUrl, { headers: localHeaders, signal: AbortSignal.timeout(8000) });
            if (!res.ok) return { ok: false, error: `HTTP ${res.status} from ${localUrl}`, models: [] };
            const data = await res.json() as any;

            // LMStudio and vLLM both return OpenAI-compatible { data: [ { id, object, ... } ] }
            // Vision detection: check model ID for known vision patterns
            const VISION_KEYWORDS = ["vision", "llava", "qwen-vl", "qvq", "minicpm-v", "cogvlm", "internvl", "phi-3-vision", "pixtral", "moondream", "bakllava", "idefics"];
            const models = (data?.data ?? []).map((m: any) => {
              const modelId = (m.id ?? "").toLowerCase();
              const isVision = VISION_KEYWORDS.some(kw => modelId.includes(kw));
              // LMStudio sometimes includes context_length in the model object
              const contextLength = m.context_length ?? m.max_context_length ?? null;
              return {
                id: m.id as string,
                name: (m.id ?? m.object ?? "unknown") as string,
                contextLength: contextLength as number | null,
                maxTokens: null as number | null,
                isVision,
                modality: isVision ? "text+image->text" : "text->text",
                pricingPrompt: null,
                pricingCompletion: null,
              };
            }).filter((m: any) => !input.visionOnly || m.isVision);
            return { ok: true, models };
          }

          return { ok: false, error: `Model discovery not supported for provider type: ${input.providerType}`, models: [] };
        } catch (error: any) {
          return { ok: false, error: error.message, models: [] };
        }
      }),

    /** Get available provider types */
    types: adminProcedure.query(() => {
      return PROVIDER_TYPES.map(t => ({
        id: t,
        label: t.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      }));
    }),
  }),

  // ─── Stage Inscriptions (The Assignments) ────────────────────────────────────
  assignments: router({
    /**
     * List all stage inscriptions with primary and fallback provider info.
     * Returns one inscription per stage (or null if no inscription exists).
     */
    list: adminProcedure.query(async () => {
      const inscriptions = await getAllStageInscriptions();
      const providers = await getAllLlmProviders();
      const providerMap = new Map(providers.map(p => [p.id, p]));
      return inscriptions.map(i => ({
        ...i,
        primaryProvider: i.primaryProviderId ? providerMap.get(i.primaryProviderId) ?? null : null,
        fallbackProvider: i.fallbackProviderId ? providerMap.get(i.fallbackProviderId) ?? null : null,
      }));
    }),

    /** Get the inscription for a specific pipeline stage */
    byStage: adminProcedure
      .input(z.object({ stage: z.enum(PIPELINE_STAGES) }))
      .query(async ({ input }) => {
        const inscription = await getStageInscriptionByStage(input.stage);
        if (!inscription) return null;
        const providers = await getAllLlmProviders();
        const providerMap = new Map(providers.map(p => [p.id, p]));
        return {
          ...inscription,
          primaryProvider: inscription.primaryProviderId ? providerMap.get(inscription.primaryProviderId) ?? null : null,
          fallbackProvider: inscription.fallbackProviderId ? providerMap.get(inscription.fallbackProviderId) ?? null : null,
        };
      }),

    /**
     * Upsert a stage inscription.
     * Creates a new inscription if none exists for the stage, or updates the existing one.
     * A provider instance can be used as primary on multiple stages and fallback on others.
     */
    upsert: adminProcedure
      .input(z.object({
        stage: z.enum(PIPELINE_STAGES),
        primaryProviderId: z.number().int().nullable().optional(),
        fallbackProviderId: z.number().int().nullable().optional(),
        promptName: z.string().max(128).nullable().optional(),
        promptVersion: z.number().int().nullable().optional(),
        temperature: z.number().min(0).max(2).nullable().optional(),
        maxTokens: z.number().int().nullable().optional(),
        llmSettings: z.record(z.string(), z.unknown()).nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await upsertStageInscription({
          stage: input.stage,
          primaryProviderId: input.primaryProviderId ?? null,
          fallbackProviderId: input.fallbackProviderId ?? null,
          promptName: input.promptName ?? null,
          promptVersion: input.promptVersion ?? null,
          temperature: input.temperature ?? null,
          maxTokens: input.maxTokens ?? null,
          llmSettings: input.llmSettings as Record<string, unknown> | null | undefined,
          isActive: input.isActive ?? true,
        });
        return { success: true, id };
      }),

    /** Update an existing inscription by ID */
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        primaryProviderId: z.number().int().nullable().optional(),
        fallbackProviderId: z.number().int().nullable().optional(),
        /** Name of the system_prompts record to use for this stage (from Incantations & Runes) */
        promptName: z.string().max(128).nullable().optional(),
        temperature: z.number().min(0).max(2).nullable().optional(),
        maxTokens: z.number().int().nullable().optional(),
        llmSettings: z.record(z.string(), z.unknown()).nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, llmSettings, ...rest } = input;
        const updates: Record<string, unknown> = { ...rest };
        if (llmSettings !== undefined) updates.llmSettings = llmSettings;
        await updateStageInscription(id, updates as any);
        return { success: true };
      }),

    /** Delete an inscription by ID */
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteStageInscription(input.id);
        return { success: true };
      }),

    /** Get available pipeline stages */
    stages: adminProcedure.query(() => {
      return PIPELINE_STAGES.map(s => ({
        id: s,
        label: s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      }));
    }),

    /**
     * Pipeline topology — returns all stages with their inscription and provider info.
     * Used by the Pipeline Map visualization.
     */
    topology: adminProcedure.query(async () => {
      const inscriptions = await getAllStageInscriptions();
      const providers = await getAllLlmProviders();
      const providerMap = new Map(providers.map(p => [p.id, p]));
      const inscriptionMap = new Map(inscriptions.map(i => [i.stage, i]));

      return PIPELINE_STAGES.map(stage => {
        const inscription = inscriptionMap.get(stage);
        const primary = inscription?.primaryProviderId ? providerMap.get(inscription.primaryProviderId) : undefined;
        const fallback = inscription?.fallbackProviderId ? providerMap.get(inscription.fallbackProviderId) : undefined;
        return {
          stage,
          inscription: inscription ? {
            id: inscription.id,
            isActive: inscription.isActive,
            promptName: inscription.promptName ?? null,
            temperature: inscription.temperature,
            maxTokens: inscription.maxTokens,
            llmSettings: inscription.llmSettings ?? null,
          } : null,
          primaryProvider: primary ? {
            id: primary.id,
            displayName: primary.displayName,
            name: primary.name,
            modelId: primary.modelId,
            providerType: primary.providerType,
            isActive: primary.isActive,
          } : null,
          fallbackProvider: fallback ? {
            id: fallback.id,
            displayName: fallback.displayName,
            name: fallback.name,
            modelId: fallback.modelId,
            providerType: fallback.providerType,
            isActive: fallback.isActive,
          } : null,
        };
      });
    }),
  }),

  // ─── Supabase Instance Registry (The Vault Nexus) ────────────────────────
  connections: router({
    /** List all Supabase instances (credentials masked) */
    list: adminProcedure.query(async () => {
      const instances = await getAllSupabaseInstances();
      return instances.map(i => ({
        ...i,
        encryptedPassword: undefined,
        passwordIv: undefined,
        passwordAuthTag: undefined,
        encryptedServiceKey: undefined,
        serviceKeyIv: undefined,
        serviceKeyAuthTag: undefined,
        hasPassword: !!i.encryptedPassword,
        hasServiceKey: !!i.encryptedServiceKey,
      }));
    }),

    /** Get a single instance by ID (credentials masked) */
    get: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const instance = await getSupabaseInstanceById(input.id);
        if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found." });
        return {
          ...instance,
          encryptedPassword: undefined,
          passwordIv: undefined,
          passwordAuthTag: undefined,
          encryptedServiceKey: undefined,
          serviceKeyIv: undefined,
          serviceKeyAuthTag: undefined,
          hasPassword: !!instance.encryptedPassword,
          hasServiceKey: !!instance.encryptedServiceKey,
        };
      }),

    /** Register a new Supabase instance */
    create: adminProcedure
      .input(z.object({
        name: z.string().max(128),
        connectionType: z.enum(SUPABASE_CONNECTION_TYPES),
        host: z.string().max(256),
        port: z.number().int().min(1).max(65535).default(5432),
        databaseName: z.string().max(128).default("postgres"),
        password: z.string().optional(),
        serviceKey: z.string().optional(),
        anonKey: z.string().optional(),
        supabaseUrl: z.string().max(512).optional(),
        role: z.enum(SUPABASE_ROLES).default("primary"),
        syncMode: z.enum(SUPABASE_SYNC_MODES).default("primary_only"),
        useSsl: z.boolean().default(false),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        let encryptedPassword: string | undefined;
        let passwordIv: string | undefined;
        let passwordAuthTag: string | undefined;
        let encryptedServiceKey: string | undefined;
        let serviceKeyIv: string | undefined;
        let serviceKeyAuthTag: string | undefined;
        let serviceKeyPrefix: string | undefined;
        let serviceKeySuffix: string | undefined;
        let serviceKeyLength: number | undefined;

        if (input.password) {
          const enc = encryptSecret(input.password);
          encryptedPassword = enc.ciphertext;
          passwordIv = enc.iv;
          passwordAuthTag = enc.authTag;
        }
        if (input.serviceKey) {
          const enc = encryptSecret(input.serviceKey);
          encryptedServiceKey = enc.ciphertext;
          serviceKeyIv = enc.iv;
          serviceKeyAuthTag = enc.authTag;
          const { keyPrefix, keySuffix, keyLength } = storeSecretHint(input.serviceKey);
          serviceKeyPrefix = keyPrefix;
          serviceKeySuffix = keySuffix;
          serviceKeyLength = keyLength;
        }

        const id = await createSupabaseInstance({
          name: input.name,
          connectionType: input.connectionType,
          host: input.host,
          port: input.port,
          databaseName: input.databaseName,
          encryptedPassword,
          passwordIv,
          passwordAuthTag,
          encryptedServiceKey,
          serviceKeyIv,
          serviceKeyAuthTag,
          serviceKeyPrefix,
          serviceKeySuffix,
          serviceKeyLength,
          anonKey: input.anonKey,
          supabaseUrl: input.supabaseUrl,
          role: input.role,
          syncMode: input.syncMode,
          useSsl: input.useSsl,
          notes: input.notes,
        });
        return { success: true, id };
      }),

    /** Update an existing Supabase instance */
    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().max(128).optional(),
        host: z.string().max(256).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        databaseName: z.string().max(128).optional(),
        password: z.string().optional(),
        clearPassword: z.boolean().optional(),
        serviceKey: z.string().optional(),
        clearServiceKey: z.boolean().optional(),
        anonKey: z.string().optional(),
        supabaseUrl: z.string().max(512).optional(),
        role: z.enum(SUPABASE_ROLES).optional(),
        syncMode: z.enum(SUPABASE_SYNC_MODES).optional(),
        useSsl: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.host !== undefined) updates.host = input.host;
        if (input.port !== undefined) updates.port = input.port;
        if (input.databaseName !== undefined) updates.databaseName = input.databaseName;
        if (input.anonKey !== undefined) updates.anonKey = input.anonKey;
        if (input.supabaseUrl !== undefined) updates.supabaseUrl = input.supabaseUrl;
        if (input.role !== undefined) updates.role = input.role;
        if (input.syncMode !== undefined) updates.syncMode = input.syncMode;
        if (input.useSsl !== undefined) updates.useSsl = input.useSsl;
        if (input.notes !== undefined) updates.notes = input.notes;

        if (input.clearPassword) {
          updates.encryptedPassword = null;
          updates.passwordIv = null;
          updates.passwordAuthTag = null;
        } else if (input.password) {
          const enc = encryptSecret(input.password);
          updates.encryptedPassword = enc.ciphertext;
          updates.passwordIv = enc.iv;
          updates.passwordAuthTag = enc.authTag;
        }

        if (input.clearServiceKey) {
          updates.encryptedServiceKey = null;
          updates.serviceKeyIv = null;
          updates.serviceKeyAuthTag = null;
          updates.serviceKeyPrefix = null;
          updates.serviceKeySuffix = null;
          updates.serviceKeyLength = null;
        } else if (input.serviceKey) {
          const enc = encryptSecret(input.serviceKey);
          updates.encryptedServiceKey = enc.ciphertext;
          updates.serviceKeyIv = enc.iv;
          updates.serviceKeyAuthTag = enc.authTag;
          const { keyPrefix, keySuffix, keyLength } = storeSecretHint(input.serviceKey);
          updates.serviceKeyPrefix = keyPrefix;
          updates.serviceKeySuffix = keySuffix;
          updates.serviceKeyLength = keyLength;
        }

        await updateSupabaseInstance(input.id, updates);
        return { success: true };
      }),

    /** Remove a Supabase instance */
    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteSupabaseInstance(input.id);
        return { success: true };
      }),

    /** Set an instance as the active pipeline target */
    setActive: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await setActiveSupabaseInstance(input.id);
        return { success: true };
      }),

    /** Test Postgres connectivity to an instance (full round-trip query) */
    test: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const result = await testSupabaseInstanceConnection(input.id);
        if (!result.ok) {
          const instance = await getSupabaseInstanceById(input.id);
          if (!instance) throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found." });
        }
        return result;
      }),

    /** Update bootstrap status for an instance */
    setBootstrapStatus: adminProcedure
      .input(z.object({
        id: z.number().int(),
        status: z.enum(["pending", "in_progress", "completed", "failed"]),
      }))
      .mutation(async ({ input }) => {
        const updates: Record<string, unknown> = { bootstrapStatus: input.status };
        if (input.status === "completed") updates.bootstrapCompletedAt = new Date();
        await updateSupabaseInstance(input.id, updates);
        return { success: true };
      }),

    /** Get available connection types */
    types: adminProcedure.query(() => {
      const labels: Record<string, string> = {
        supabase_local: "Supabase Local",
        supabase_cloud: "Supabase Cloud",
        postgres_docker: "PostgreSQL (Docker)",
      };
      const connectionTypes = SUPABASE_CONNECTION_TYPES.map(t => ({ id: t, label: labels[t] ?? t }));
      return { connectionTypes };
    }),
  }),

  // ─── Library (Documents & Pages — Enter the Arkanum) ─────────────────────
  library: router({
    /** List documents visible to the current user (own + public, or all for admins) */
    listDocuments: protectedProcedure
      .input(z.object({
        gameSystem: z.string().optional(),
        status: z.enum(DOCUMENT_STATUSES).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const docs = await getAllDocuments();
        let filtered = docs;
        if (ctx.user.role !== "admin") {
          filtered = filtered.filter(d => d.ownerUserId === ctx.user.id || d.visibility !== "private");
        }
        if (input?.gameSystem) filtered = filtered.filter(d => d.gameSystem === input.gameSystem);
        if (input?.status) filtered = filtered.filter(d => d.status === input.status);
        return filtered;
      }),

    /** Search documents by title, filename, or game system (scoped by ownership for non-admins) */
    searchDocuments: protectedProcedure
      .input(z.object({ query: z.string().min(1).max(256) }))
      .query(async ({ ctx, input }) => {
        const results = await searchDocuments(input.query);
        if (ctx.user.role === "admin") return results;
        return results.filter(d => d.ownerUserId === ctx.user.id || d.visibility !== "private");
      }),

    /** Get a single document by ID */
    getDocument: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const doc = await getDocumentById(input.id);
        if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found in the Library." });
        return doc;
      }),

    /** Get all pages for a document */
    getPages: protectedProcedure
      .input(z.object({ documentId: z.number().int() }))
      .query(async ({ input }) => {
        return getPagesByDocumentId(input.documentId);
      }),

    /** Get a single page with its OCR result */
    getPageWithOcr: protectedProcedure
      .input(z.object({ pageId: z.number().int() }))
      .query(async ({ input }) => {
        const page = await getPageById(input.pageId);
        if (!page) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found." });
        const ocrResult = await getOcrResultByPageId(input.pageId);
        return { page, ocrResult: ocrResult ?? null };
      }),

    /** Create a new document (admin only — used by pipeline) */
    createDocument: adminProcedure
      .input(z.object({
        filename: z.string().max(512),
        gameSystem: z.string().max(128).optional(),
        edition: z.string().max(64).optional(),
        title: z.string().max(512).optional(),
        publisher: z.string().max(256).optional(),
        totalPages: z.number().int().min(0).default(0),
        pdfUrl: z.string().max(1024).optional(),
        coverThumbnailUrl: z.string().max(1024).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const doc = await createDocument({ ...input, ownerUserId: ctx.user.id });
        return { success: true, id: doc.id };
      }),

    /** Update a document (admin only) */
    updateDocument: adminProcedure
      .input(z.object({
        id: z.number().int(),
        title: z.string().max(512).optional(),
        gameSystem: z.string().max(128).optional(),
        edition: z.string().max(64).optional(),
        publisher: z.string().max(256).optional(),
        status: z.enum(DOCUMENT_STATUSES).optional(),
        totalPages: z.number().int().optional(),
        processedPages: z.number().int().optional(),
        flaggedPages: z.number().int().optional(),
        avgConfidence: z.number().int().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateDocument(id, updates as any);
        return { success: true };
      }),

    /** Delete a document and all its pages/OCR data (admin only) */
    deleteDocument: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteDocument(input.id);
        return { success: true };
      }),

    /** Add a page to a document (admin only — used by pipeline) */
    addPage: adminProcedure
      .input(z.object({
        documentId: z.number().int(),
        pageNumber: z.number().int().min(1),
        rawPngUrl: z.string().url().optional(),
        /** @deprecated use rawPngUrl — kept for backward compat with tests */
        imageUrl: z.string().max(1024).optional(),
        thumbnailUrl: z.string().max(1024).optional(),
        phash: z.string().max(64).optional(),
        imageWidth: z.number().int().optional(),
        imageHeight: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        const { imageUrl, ...rest } = input;
        const page = await createDocumentPage({
          ...rest,
          rawPngUrl: rest.rawPngUrl ?? imageUrl,
        });
        return { success: true, id: page.id };
      }),

    /** Add or update OCR result for a page (admin only — used by pipeline) */
    upsertOcrResult: adminProcedure
      .input(z.object({
        pageId: z.number().int(),
        rawText: z.string().optional(),
        structuredData: z.record(z.string(), z.unknown()).optional(),
        layoutMetadata: z.record(z.string(), z.unknown()).optional(),
        confidence: z.number().int().min(0).max(100).optional(),
        status: z.enum(OCR_RESULT_STATUSES).optional(),
        pass1Model: z.string().max(256).optional(),
        pass2Model: z.string().max(256).optional(),
        auditLog: z.array(z.object({
          timestamp: z.string(),
          action: z.string(),
          model: z.string().optional(),
          detail: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await getOcrResultByPageId(input.pageId);
        if (existing) {
          const { pageId, ...updates } = input;
          await updateOcrResult(existing.id, updates as any);
          return { success: true, id: existing.id, action: "updated" };
        } else {
          const created = await createOcrResult(input as any);
          return { success: true, id: created.id, action: "created" };
        }
      }),

    /** Get available document statuses */
    documentStatuses: protectedProcedure.query(() => {
      return DOCUMENT_STATUSES.map(s => ({
        id: s,
        label: s.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      }));
    }),
  }),

  // ─── HITL Queue (Archivist's Desk) ────────────────────────────────────────
  hitl: router({
    /** List HITL queue items with optional filters */
    list: protectedProcedure
      .input(z.object({
        status: z.enum(HITL_STATUSES).optional(),
        priority: z.enum(HITL_PRIORITIES).optional(),
        limit: z.number().int().min(1).max(2000).optional(),
        offset: z.number().int().min(0).optional(),
      }).optional())
      .query(async ({ input }) => {
        const items = await getAllHitlItems({
          status: input?.status,
          priority: input?.priority,
          limit: input?.limit ?? 50,
          offset: input?.offset ?? 0,
        });
        if (items.length === 0) return [];

        // Batch-fetch pages, documents, and OCR results in 3 queries
        const pageIds = [...new Set(items.map(i => i.pageId))];
        const pages = await getPagesByIds(pageIds);
        const pageMap = new Map(pages.map(p => [p.id, p]));

        const documentIds = [...new Set(pages.map(p => p.documentId))];
        const docs = await getDocumentsByIds(documentIds);
        const docMap = new Map(docs.map(d => [d.id, d]));

        const ocrByPage = await getOcrResultsByPageIds(pageIds);
        const ocrMap = new Map(ocrByPage.map(r => [r.pageId, r]));

        return items.map(item => {
          const page = pageMap.get(item.pageId) ?? null;
          const doc = page ? docMap.get(page.documentId) ?? null : null;
          const ocr = page ? ocrMap.get(page.id) ?? null : null;
          return {
            ...item,
            page: page ?? null,
            ocr: ocr ?? null,
            documentTitle: doc?.title ?? doc?.filename ?? "Unknown",
            documentId: page?.documentId ?? null,
          };
        });
      }),

    /** Get a single HITL item with full context (page, OCR, document) */
    get: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const item = await getHitlItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "HITL item not found." });
        const page = await getPageById(item.pageId);
        const ocrResult = item.ocrResultId ? await getOcrResultById(item.ocrResultId) : await getOcrResultByPageId(item.pageId);
        let document = null;
        if (page) {
          document = await getDocumentById(page.documentId);
        }
        return { item, page: page ?? null, ocrResult: ocrResult ?? null, document: document ?? null };
      }),

    /** Get HITL stats for the dashboard */
    stats: protectedProcedure.query(async () => {
      return getHitlStats();
    }),

    /** Flag a page for HITL review */
    flag: protectedProcedure
      .input(z.object({
        pageId: z.number().int(),
        ocrResultId: z.number().int().optional(),
        reason: z.string().max(1024),
        flagCategory: z.string().max(64).optional(),
        priority: z.enum(HITL_PRIORITIES).default("medium"),
      }))
      .mutation(async ({ input }) => {
        const item = await createHitlItem(input);
        // Also mark the page as flagged
        await updateDocumentPage(input.pageId, { isFlagged: true });
        return { success: true, id: item.id };
      }),

    /** Assign a HITL item to a reviewer */
    assign: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        assignedTo: z.number().int(),
      }))
      .mutation(async ({ input }) => {
        await updateHitlItem(input.id, { assignedTo: input.assignedTo, status: "in_progress" });
        return { success: true };
      }),

    /** Resolve a HITL item — apply corrections to the OCR result */
    resolve: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        correctedText: z.string().optional(),
        correctedStructuredData: z.record(z.string(), z.unknown()).optional(),
        resolutionNotes: z.string().max(2048).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const item = await getHitlItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "HITL item not found." });

        // Update the HITL item
        await updateHitlItem(input.id, {
          status: "resolved",
          resolutionNotes: input.resolutionNotes,
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
        });

        // Apply corrections to the OCR result if provided
        const ocrResult = item.ocrResultId
          ? await getOcrResultById(item.ocrResultId)
          : await getOcrResultByPageId(item.pageId);

        if (ocrResult && (input.correctedText || input.correctedStructuredData)) {
          await updateOcrResult(ocrResult.id, {
            correctedText: input.correctedText,
            correctedStructuredData: input.correctedStructuredData,
            correctedBy: ctx.user.id,
            correctedAt: new Date(),
            status: "corrected",
          });
        }

        return { success: true };
      }),

    /** Skip a HITL item */
    skip: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        resolutionNotes: z.string().max(2048).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateHitlItem(input.id, {
          status: "skipped",
          resolutionNotes: input.resolutionNotes,
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
        });
        return { success: true };
      }),

    /** Escalate a HITL item */
    escalate: protectedProcedure
      .input(z.object({
        id: z.number().int(),
        resolutionNotes: z.string().max(2048).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateHitlItem(input.id, {
          status: "escalated",
          resolutionNotes: input.resolutionNotes,
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
        });
        return { success: true };
      }),

    /** Clear (delete) HITL items by status — useful during test cycles */
    clear: adminProcedure
      .input(z.object({
        statuses: z.array(z.enum(HITL_STATUSES)).optional(),
      }))
      .mutation(async ({ input }) => {
        await clearHitlItems(input.statuses ?? []);
        return { success: true };
      }),

    /** Bulk-approve a list of HITL items with no corrections */
    bulkResolve: protectedProcedure
      .input(z.object({ ids: z.array(z.number().int()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        for (const id of input.ids) {
          await updateHitlItem(id, {
            status: "resolved",
            resolvedBy: ctx.user.id,
            resolvedAt: new Date(),
          });
        }
        return { success: true, count: input.ids.length };
      }),

    /** Get the next unreviewed item (oldest critical/high/medium/low queued or in_progress) */
    nextUnreviewed: protectedProcedure
      .input(z.object({
        currentId: z.number().int().optional(),
      }).optional())
      .query(async () => {
        // Priority order: critical > high > medium > low, then oldest first
        const items = await getAllHitlItems({
          status: "queued",
          limit: 1,
          orderByPriority: true,
        });
        if (items.length > 0) return items[0];
        // Fall back to in_progress
        const inProgress = await getAllHitlItems({
          status: "in_progress",
          limit: 1,
          orderByPriority: true,
        });
        return inProgress[0] ?? null;
      }),

    /** Export OCR results as structured records for model fine-tuning.
     *  Pass specific `ids` for selected items, or `status` to bulk-export
     *  an entire status bucket (up to 10 000 records). */
    exportOcr: protectedProcedure
      .input(z.object({
        ids: z.array(z.number().int()).optional(),
        status: z.enum(HITL_STATUSES).optional(),
      }).optional())
      .query(async ({ input }) => {
        const items = input?.ids?.length
          ? await getHitlItemsByIds(input.ids)
          : await getAllHitlItems({ status: input?.status, limit: 10_000 });

        if (items.length === 0) return [];

        const pageIds = [...new Set(items.map(i => i.pageId))];
        const pages = await getPagesByIds(pageIds);
        const pageMap = new Map(pages.map(p => [p.id, p]));

        const documentIds = [...new Set(pages.map(p => p.documentId))];
        const docs = await getDocumentsByIds(documentIds);
        const docMap = new Map(docs.map(d => [d.id, d]));

        const ocrByPage = await getOcrResultsByPageIds(pageIds);
        const ocrMap = new Map(ocrByPage.map(r => [r.pageId, r]));

        return items.map(item => {
          const page = pageMap.get(item.pageId) ?? null;
          const doc = page ? docMap.get(page.documentId) ?? null : null;
          const ocr = page ? ocrMap.get(page.id) ?? null : null;
          const imageUrl = page?.rawPngUrl
            ? `/api/pipeline/pages/${page.rawPngUrl.replace(/.*\/workspace\//, "")}`
            : null;

          return {
            hitl_id: item.id,
            hitl_status: item.status,
            hitl_reason: item.reason,
            document: {
              title: doc?.title ?? doc?.filename ?? "Unknown",
              publisher: doc?.publisher ?? null,
              type: doc?.documentType ?? null,
              game_system: doc?.gameSystem ?? null,
              summary: doc?.documentSummary ?? null,
            },
            page: {
              number: page?.pageNumber ?? null,
              image_url: imageUrl,
              layout_type: page?.layoutType ?? null,
              ocr_confidence: ocr?.confidence ?? null,
              model: ocr?.pass1Model ?? null,
              extracted_at: ocr?.createdAt ?? null,
            },
            regions: page?.contentRegions ?? [],
            ocr_output: ocr?.structuredData ?? null,
            raw_text: ocr?.rawText ?? null,
            human_corrections: (ocr?.correctedStructuredData || ocr?.correctedText)
              ? { corrected_text: ocr?.correctedText ?? null, corrected_data: ocr?.correctedStructuredData ?? null }
              : null,
          };
        });
      }),
  }),

  // ─── Pipeline Integration API ───────────────────────────────────────────────
  // These endpoints are called by the Python OCR pipeline (llm_ocr_processor.py)
  // using the SCHEDULED_TASK_COOKIE for authentication.
  //
  // Usage from Python pipeline:
  //   import requests
  //   session = requests.Session()
  //   session.cookies.set('app_session_id', SCHEDULED_TASK_COOKIE)
  //   session.post(f'{BASE_URL}/api/trpc/pipeline.ingestPage', json={...})
  //
  // Or via curl:
  //   curl -X POST 'https://your-site.manus.space/api/trpc/pipeline.ingestPage' \
  //     -H 'Content-Type: application/json' \
  //     -H 'Cookie: app_session_id=$SCHEDULED_TASK_COOKIE' \
  //     -d '{"documentId":1,"pageNumber":5,"imageUrl":"https://..."}'
  pipeline: router({
    /**
     * Register a new page image from the PDF conversion pipeline.
     * Called after pdf-to-png conversion for each page.
     */
    ingestPage: protectedProcedure
      .input(z.object({
        documentId: z.number().int(),
        pageNumber: z.number().int().min(1),
        rawPngUrl: z.string().url(),
        thumbnailUrl: z.string().url().optional(),
        phash: z.string().max(64).optional(),
        imageWidth: z.number().int().optional(),
        imageHeight: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        // Verify document exists
        const doc = await getDocumentById(input.documentId);
        if (!doc) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Document ${input.documentId} not found.` });
        }
        // Check for phash duplicate across all documents
        if (input.phash) {
          const allPages = await getPagesByDocumentId(input.documentId);
          // Also check across other documents via phash lookup
          const phashDuplicate = await getPageByPhash(input.phash);
          if (phashDuplicate) {
            return {
              success: true,
              pageId: phashDuplicate.id,
              isDuplicate: true,
              duplicateOfPageId: phashDuplicate.id,
              action: "duplicate" as const,
            };
          }
          // Also check within same document by page number
          const existing = allPages.find(p => p.pageNumber === input.pageNumber);
          if (existing) {
            return { success: true, pageId: existing.id, isDuplicate: false, action: "existing" as const };
          }
        } else {
          // No phash: check by page number only
          const pages = await getPagesByDocumentId(input.documentId);
          const existing = pages.find(p => p.pageNumber === input.pageNumber);
          if (existing) {
            return { success: true, pageId: existing.id, isDuplicate: false, action: "existing" as const };
          }
        }
        const page = await createDocumentPage({
          documentId: input.documentId,
          pageNumber: input.pageNumber,
          rawPngUrl: input.rawPngUrl,
          thumbnailUrl: input.thumbnailUrl,
          phash: input.phash,
          imageWidth: input.imageWidth,
          imageHeight: input.imageHeight,
        });
        return { success: true, pageId: page.id, isDuplicate: false, action: "created" as const };
      }),

    /**
     * Submit OCR results for a page from the two-pass OCR pipeline.
     * Automatically flags low-confidence results into the HITL queue.
     * Called after Pass 2 (cloud LLM) completes.
     */
    submitOcrResult: protectedProcedure
      .input(z.object({
        pageId: z.number().int(),
        rawText: z.string().optional(),
        structuredData: z.record(z.string(), z.unknown()).optional(),
        confidence: z.number().min(0).max(100).optional(),
        status: z.enum(OCR_RESULT_STATUSES).optional(),
        pass1Model: z.string().max(128).optional(),
        pass2Model: z.string().max(128).optional(),
        layoutMetadata: z.record(z.string(), z.unknown()).optional(),
        auditLog: z.array(z.object({
          timestamp: z.string(),
          action: z.string(),
          model: z.string().optional(),
          detail: z.string().optional(),
        })).optional(),
        confidenceThreshold: z.number().min(10).max(95).default(70),
        flagReason: z.string().max(512).optional(),
      }))
      .mutation(async ({ input }) => {
        const { confidenceThreshold, flagReason, ...ocrData } = input;

        // Verify page exists
        const page = await getPageById(input.pageId);
        if (!page) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Page ${input.pageId} not found.` });
        }

        // Upsert OCR result
        const existing = await getOcrResultByPageId(input.pageId);
        let ocrResultId: number;
        if (existing) {
          await updateOcrResult(existing.id, {
            rawText: ocrData.rawText,
            structuredData: ocrData.structuredData,
            confidence: ocrData.confidence,
            status: ocrData.status ?? "pass2_complete",
            pass1Model: ocrData.pass1Model,
            pass2Model: ocrData.pass2Model,
            layoutMetadata: ocrData.layoutMetadata,
            auditLog: ocrData.auditLog,
          });
          ocrResultId = existing.id;
        } else {
          const created = await createOcrResult({
            pageId: input.pageId,
            rawText: ocrData.rawText,
            structuredData: ocrData.structuredData,
            confidence: ocrData.confidence,
            status: ocrData.status ?? "pass2_complete",
            pass1Model: ocrData.pass1Model,
            pass2Model: ocrData.pass2Model,
            layoutMetadata: ocrData.layoutMetadata,
            auditLog: ocrData.auditLog,
          });
          ocrResultId = created.id;
        }

        // Auto-flag if below confidence threshold
        let hitlId: number | null = null;
        const conf = ocrData.confidence ?? 100;
        if (conf < confidenceThreshold) {
          const priority = conf < 40 ? "critical" : conf < 55 ? "high" : conf < confidenceThreshold ? "medium" : "low";
          const reason = flagReason ?? `Auto-flagged: confidence ${conf}% is below threshold ${confidenceThreshold}%`;
          // Check if already flagged (avoid duplicate queue entries)
          const existingFlags = await getHitlItemsByPageId(input.pageId);
          const activeFlag = existingFlags.find(f => f.status === "queued" || f.status === "in_progress");
          if (!activeFlag) {
            const hitlItem = await createHitlItem({
              pageId: input.pageId,
              ocrResultId,
              reason,
              flagCategory: "low_confidence",
              priority,
            });
            hitlId = hitlItem.id;
          }
        }

        return {
          success: true,
          ocrResultId,
          autoFlagged: hitlId !== null,
          hitlId,
        };
      }),

    /**
     * Manually flag a page for HITL review from the pipeline.
     * Called when the pipeline detects issues (e.g., layout errors, consensus failures).
     */
    flagPage: protectedProcedure
      .input(z.object({
        pageId: z.number().int(),
        reason: z.string().min(1).max(1024),
        flagCategory: z.enum(["low_confidence", "layout_error", "consensus_failure", "manual_review", "other"]).default("manual_review"),
        priority: z.enum(HITL_PRIORITIES).default("medium"),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }))
      .mutation(async ({ input }) => {
        // Verify page exists
        const page = await getPageById(input.pageId);
        if (!page) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Page ${input.pageId} not found.` });
        }
        // Check for existing active flag
        const existingFlags = await getHitlItemsByPageId(input.pageId);
        const activeFlag = existingFlags.find(f => f.status === "queued" || f.status === "in_progress");
        if (activeFlag) {
          return { success: true, id: activeFlag.id, action: "existing" as const };
        }
        const ocrResult = await getOcrResultByPageId(input.pageId);
        const hitlItem = await createHitlItem({
          pageId: input.pageId,
          ocrResultId: ocrResult?.id ?? null,
          reason: input.reason,
          flagCategory: input.flagCategory,
          priority: input.priority,
        });
        return { success: true, id: hitlItem.id, action: "created" as const };
      }),

    /**
     * Get pipeline status for a document (pages ingested, OCR complete, flagged count).
     * Useful for the Python pipeline to check progress before resuming.
     */
    documentStatus: protectedProcedure
      .input(z.object({ documentId: z.number().int() }))
      .query(async ({ input }) => {
        const doc = await getDocumentById(input.documentId);
        if (!doc) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Document ${input.documentId} not found.` });
        }
        const pages = await getPagesByDocumentId(input.documentId);
        const ocrDone = await Promise.all(pages.map(p => getOcrResultByPageId(p.id)));
        const ocrCompleteCount = ocrDone.filter(r => r !== null).length;
        const flaggedPages = await Promise.all(
          pages.map(async p => {
            const flags = await getHitlItemsByPageId(p.id);
            return flags.some(f => f.status === "queued" || f.status === "in_progress") ? p.id : null;
          })
        );
        return {
          documentId: input.documentId,
          title: doc.title ?? doc.filename,
          status: doc.status,
          totalPages: doc.totalPages ?? pages.length,
          pagesIngested: pages.length,
          ocrComplete: ocrCompleteCount,
          flaggedCount: flaggedPages.filter(Boolean).length,
          percentComplete: pages.length > 0 ? Math.round((ocrCompleteCount / pages.length) * 100) : 0,
        };
      }),
  }),

  // ─── Google Drive ─────────────────────────────────────────────────────────────
  google: router({
    status: protectedProcedure.query(async () => {
      const { isGoogleConnected } = await import("./pipeline/drive");
      const connected = await isGoogleConnected();
      return { connected, clientId: ENV.googleClientId || null };
    }),

    getAccessToken: adminProcedure.query(async () => {
      const { getGoogleAccessToken } = await import("./pipeline/drive");
      try {
        const accessToken = await getGoogleAccessToken();
        return { accessToken };
      } catch {
        return { accessToken: null };
      }
    }),

    disconnect: adminProcedure.mutation(async () => {
      const { clearGoogleTokens } = await import("./pipeline/drive");
      await clearGoogleTokens();
      return { success: true };
    }),
  }),

  // ─── Game Systems ─────────────────────────────────────────────────────────────
  gameSystems: router({
    list: protectedProcedure.query(() => getAllGameSystems(true)),

    listAll: adminProcedure.query(() => getAllGameSystems(false)),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        abbreviation: z.string().max(32).optional(),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        return createGameSystem({ ...input, isActive: true });
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).max(128).optional(),
        abbreviation: z.string().max(32).nullable().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await updateGameSystem(id, updates as any);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteGameSystem(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
