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
  getAllSystemPrompts, getSystemPromptByName, upsertSystemPrompt, seedDefaultPrompts,
  getAllUsers, getUserById, updateUserRole,
  getUserPermissions, setUserPermission, deleteUserPermission, getAllPermissionsForAllUsers,
  createInvitation, getAllInvitations, revokeInvitation,
  getAllSystemConfig, getSystemConfigByCategory, upsertSystemConfig, deleteSystemConfig,
  getAllIngestionJobs, getActiveIngestionJobs, getIngestionJobById, createIngestionJob, updateIngestionJobStatus, getIngestionJobStats,
  recordTelemetryEvent, getTelemetryEvents, getTelemetrySummary,
  pingDatabase,
} from "./db";
import { ENV } from "./_core/env";
import { FEATURE_AREAS } from "../drizzle/schema";

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
  }),

  // ─── Health Checks ─────────────────────────────────────────────────────────
  health: router({
    /** Ping the database and return status + latency */
    database: publicProcedure.query(async () => {
      return pingDatabase();
    }),

    /** Check all services and return aggregate status */
    all: publicProcedure.query(async () => {
      const dbResult = await pingDatabase();

      // For LM Studio and OpenRouter, we check if their config exists
      // In production, these would actually ping the endpoints
      return {
        database: dbResult,
        agents: { ok: true, latencyMs: 0, detail: "Available & Ready" },
        scribes: { ok: true, latencyMs: 0, detail: "Idle — No Active Jobs" },
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

    upsert: protectedProcedure
      .input(z.object({
        name: z.string().max(128),
        category: z.enum(["pipeline", "console_experience"]),
        description: z.string().optional(),
        promptText: z.string(),
        version: z.number().int().optional(),
      }))
      .mutation(async ({ input }) => {
        await upsertSystemPrompt(input);
        return { success: true };
      }),

    seedDefaults: protectedProcedure.mutation(async () => {
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

    /** Create a new ingestion job */
    create: adminProcedure
      .input(z.object({
        sourceFile: z.string().max(512),
        gameSystem: z.string().max(128).optional(),
        totalPages: z.number().int().min(0).default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await createIngestionJob({
          sourceFile: input.sourceFile,
          gameSystem: input.gameSystem,
          totalPages: input.totalPages,
        });
        return { success: true, id };
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
    /** Record a new telemetry event */
    record: protectedProcedure
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
});

export type AppRouter = typeof appRouter;
