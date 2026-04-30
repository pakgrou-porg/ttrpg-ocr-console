import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getUserProfile,
  upsertUserProfile,
  getAllSystemPrompts,
  getSystemPromptByName,
  upsertSystemPrompt,
  seedDefaultPrompts,
} from "./db";

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

  // ─── User Profile ─────────────────────────────────────────────────────────
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserProfile(ctx.user.id);
    }),

    upsert: protectedProcedure
      .input(z.object({
        displayName: z.string().max(128).optional(),
        preferredGame: z.string().max(128).optional(),
        preferredVersion: z.string().max(64).optional(),
        savedEntries: z.array(z.string()).optional(),
        savedGroups: z.array(z.object({
          id: z.string(),
          name: z.string(),
          entries: z.array(z.string()),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserProfile({
          userId: ctx.user.id,
          ...input,
        });
        return { success: true };
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
});

export type AppRouter = typeof appRouter;
