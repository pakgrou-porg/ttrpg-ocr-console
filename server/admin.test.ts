import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(role: "admin" | "user" = "admin"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-owner",
      email: "admin@kodex.test",
      name: "Arch-Magister Test",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Admin — feature areas ─────────────────────────────────────────────────────

describe("admin.featureAreas", () => {
  it("returns a non-empty list of feature areas for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const areas = await caller.admin.featureAreas();
    expect(Array.isArray(areas)).toBe(true);
    expect(areas.length).toBeGreaterThan(0);
    // Each area should have id and label
    for (const area of areas) {
      expect(area).toHaveProperty("id");
      expect(area).toHaveProperty("label");
    }
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.featureAreas()).rejects.toThrow();
  });
});

// ── Admin — list users ────────────────────────────────────────────────────────

describe("admin.listUsers", () => {
  it("returns an array for admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const users = await caller.admin.listUsers();
    expect(Array.isArray(users)).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.listUsers()).rejects.toThrow();
  });
});

// ── Admin — list invitations ──────────────────────────────────────────────────

describe("admin.listInvitations", () => {
  it("returns an array for admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const invitations = await caller.admin.listInvitations();
    expect(Array.isArray(invitations)).toBe(true);
  });

  it("throws FORBIDDEN for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.listInvitations()).rejects.toThrow();
  });
});

// ── Admin — setRole validation ────────────────────────────────────────────────

describe("admin.setRole input validation", () => {
  it("rejects invalid role values", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.admin.setRole({ userId: 1, role: "superuser" as any })
    ).rejects.toThrow();
  });
});

// ── Admin — createInvitation validation ──────────────────────────────────────

describe("admin.createInvitation input validation", () => {
  it("rejects invalid email", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.admin.createInvitation({
        email: "not-an-email",
        role: "user",
        expiresInDays: 7,
      })
    ).rejects.toThrow();
  });

  it("rejects expiresInDays below minimum", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.admin.createInvitation({
        email: "valid@test.com",
        role: "user",
        expiresInDays: 0,
      })
    ).rejects.toThrow();
  });
});
