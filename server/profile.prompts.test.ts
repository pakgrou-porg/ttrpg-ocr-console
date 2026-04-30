import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  getUserProfile: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    displayName: "Evos the Archivist",
    preferredGame: "Dungeons & Dragons",
    preferredVersion: "5e",
    savedEntries: [],
    savedGroups: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  upsertUserProfile: vi.fn().mockResolvedValue(undefined),
  getAllSystemPrompts: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "pass1_layout_analysis",
      category: "pipeline",
      description: "Layout analysis prompt",
      promptText: "You are an expert document layout analyzer...",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "voice_of_arkanum",
      category: "console_experience",
      description: "Voice of the Arkanum prompt",
      promptText: "You are the Voice of the Arkanum...",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getSystemPromptByName: vi.fn().mockResolvedValue({
    id: 1,
    name: "pass1_layout_analysis",
    category: "pipeline",
    promptText: "You are an expert document layout analyzer...",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  upsertSystemPrompt: vi.fn().mockResolvedValue(undefined),
  seedDefaultPrompts: vi.fn().mockResolvedValue(undefined),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user-open-id",
      email: "test@example.com",
      name: "Test Archivist",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("profile router", () => {
  it("get: returns user profile for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.profile.get();
    expect(result).toBeDefined();
    expect(result?.displayName).toBe("Evos the Archivist");
    expect(result?.preferredGame).toBe("Dungeons & Dragons");
  });

  it("upsert: saves profile changes successfully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.profile.upsert({
      displayName: "Grand Archivist Evos",
      preferredGame: "Pathfinder",
      preferredVersion: "2e",
    });
    expect(result.success).toBe(true);
  });

  it("upsert: accepts savedEntries and savedGroups", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.profile.upsert({
      savedEntries: ["entry-uuid-1", "entry-uuid-2"],
      savedGroups: [{ id: "group-1", name: "Goblin Ambush", entries: ["entry-uuid-1"] }],
    });
    expect(result.success).toBe(true);
  });
});

describe("prompts router", () => {
  it("list: returns all system prompts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.prompts.list();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("pass1_layout_analysis");
    expect(result[1].category).toBe("console_experience");
  });

  it("getByName: returns a specific prompt by name", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.prompts.getByName({ name: "pass1_layout_analysis" });
    expect(result).toBeDefined();
    expect(result?.name).toBe("pass1_layout_analysis");
    expect(result?.category).toBe("pipeline");
  });

  it("upsert: saves a prompt successfully", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.prompts.upsert({
      name: "pass1_layout_analysis",
      category: "pipeline",
      description: "Updated description",
      promptText: "Updated prompt text for layout analysis.",
    });
    expect(result.success).toBe(true);
  });

  it("seedDefaults: seeds default prompts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.prompts.seedDefaults();
    expect(result.success).toBe(true);
  });
});
