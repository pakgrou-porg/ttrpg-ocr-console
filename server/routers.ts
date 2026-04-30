import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getUserProfile, upsertUserProfile,
  getAllSystemPrompts, getSystemPromptByName, upsertSystemPrompt, seedDefaultPrompts,
  getAllUsers, getUserById, updateUserRole,
  getUserPermissions, setUserPermission, deleteUserPermission, getAllPermissionsForAllUsers,
  createInvitation, getAllInvitations, revokeInvitation,
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

  // ─── Admin: The Conclave ──────────────────────────────────────────────────
  admin: router({
    /** List all registered users with their profiles and permissions */
    listUsers: adminProcedure.query(async () => {
      const allUsers = await getAllUsers();
      const allPerms = await getAllPermissionsForAllUsers();
      return allUsers.map(u => ({
        ...u,
        permissions: allPerms.filter(p => p.userId === u.id),
      }));
    }),

    /** Get a single user with their permissions */
    getUser: adminProcedure
      .input(z.object({ userId: z.number().int() }))
      .query(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found in the Arkanum." });
        const permissions = await getUserPermissions(input.userId);
        return { ...user, permissions };
      }),

    /** Promote or demote a user's role */
    setRole: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        role: z.enum(["user", "admin"]),
      }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),

    /** Grant or restrict a user's access to a specific feature area */
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

    /** Remove a specific permission record (restores default access) */
    removePermission: adminProcedure
      .input(z.object({
        userId: z.number().int(),
        featureArea: z.enum(FEATURE_AREAS),
      }))
      .mutation(async ({ input }) => {
        await deleteUserPermission(input.userId, input.featureArea);
        return { success: true };
      }),

    /** List all pending and accepted invitations */
    listInvitations: adminProcedure.query(async () => {
      return getAllInvitations();
    }),

    /** Create an invitation for a new user */
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
        // Build the invite URL using the origin injected by the caller
        return { success: true, token, expiresAt };
      }),

    /** Revoke a pending invitation */
    revokeInvitation: adminProcedure
      .input(z.object({ invitationId: z.number().int() }))
      .mutation(async ({ input }) => {
        await revokeInvitation(input.invitationId);
        return { success: true };
      }),

    /** Return list of all available feature areas for the permission UI */
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
