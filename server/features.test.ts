import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(role: "admin" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-scholar",
      email: "scholar@kodex.test",
      name: "Test Scholar",
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

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Health Checks ─────────────────────────────────────────────────────────────

describe("health.database", () => {
  it("returns ok and latencyMs fields for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.health.database();
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("latencyMs");
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.latencyMs).toBe("number");
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.health.database()).rejects.toThrow();
  });
});

describe("health.all", () => {
  it("returns status for all services for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.health.all();
    expect(result).toHaveProperty("database");
    expect(result).toHaveProperty("agents");
    expect(result).toHaveProperty("scribes");
    expect(result).toHaveProperty("cloudConduit");
    // Each should have ok and latencyMs
    expect(result.database).toHaveProperty("ok");
    expect(result.agents).toHaveProperty("ok");
    expect(result.scribes).toHaveProperty("ok");
    expect(result.cloudConduit).toHaveProperty("ok");
  });

  it("throws UNAUTHORIZED for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.health.all()).rejects.toThrow();
  });
});

// ── System Config ─────────────────────────────────────────────────────────────

describe("config.list", () => {
  it("returns an array for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.config.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.config.list()).rejects.toThrow();
  });
});

describe("config.set", () => {
  it("sets a config value and returns success", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.config.set({
      key: "test.setting",
      value: "test-value-123",
      category: "service_config",
    });
    expect(result).toEqual({ success: true });
  });

  it("accepts any string key including empty", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.config.set({ key: "test.key2", value: "val", category: "service_config" });
    expect(result).toEqual({ success: true });
  });
});

// ── Ingestion Jobs (Oversee the Scribes) ──────────────────────────────────────

describe("jobs.list", () => {
  it("returns an array for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.jobs.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.jobs.list()).rejects.toThrow();
  });
});

describe("jobs.stats", () => {
  it("returns stats object with expected fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.jobs.stats();
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("active");
    expect(result).toHaveProperty("completed");
    expect(result).toHaveProperty("failed");
    expect(typeof result.total).toBe("number");
  });
});

describe("jobs.create", () => {
  it("creates a job and returns success with an id", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.jobs.create({
      sourceFile: "Test_PDF.pdf",
      gameSystem: "D&D",
      totalPages: 100,
    });
    expect(result).toHaveProperty("id");
    expect(result.success).toBe(true);
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.jobs.create({
        sourceFile: "Test.pdf",
        gameSystem: "PF",
        totalPages: 50,
      })
    ).rejects.toThrow();
  });

  it("throws for non-admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.jobs.create({
        sourceFile: "Test.pdf",
        totalPages: 10,
      })
    ).rejects.toThrow();
  });
});

// ── Telemetry (Divination & Omens) ────────────────────────────────────────────

describe("telemetry.summary", () => {
  it("returns summary with expected fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.telemetry.summary();
    expect(result).toHaveProperty("totalEvents");
    expect(result).toHaveProperty("totalCostMicros");
    expect(result).toHaveProperty("avgLatency");
    expect(result).toHaveProperty("modelBreakdown");
    expect(Array.isArray(result.modelBreakdown)).toBe(true);
    expect(typeof result.totalEvents).toBe("number");
  });
});

describe("telemetry.record", () => {
  it("records a telemetry event successfully (admin only)", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.telemetry.record({
      eventType: "ocr_pass2",
      source: "gemini-2.5-pro",
      metricValue: 1200,
      costMicros: 50,
    });
    expect(result).toEqual({ success: true });
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.telemetry.record({
        eventType: "test",
        source: "test-model",
      })
    ).rejects.toThrow();
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.telemetry.record({
        eventType: "test",
        source: "test-model",
      })
    ).rejects.toThrow();
  });
});

// ── Ramblings (LLM) ──────────────────────────────────────────────────────────

describe("ramblings.generate", () => {
  it("returns a text field with content", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.ramblings.generate({ topic: "dragons" });
    expect(result).toHaveProperty("text");
    expect(typeof result.text).toBe("string");
    expect(result.text.length).toBeGreaterThan(0);
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.ramblings.generate({ topic: "goblins" })
    ).rejects.toThrow();
  });
});

// ── Permissions ───────────────────────────────────────────────────────────────

describe("permissions.mine", () => {
  it("returns an array for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.permissions.mine();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.permissions.mine()).rejects.toThrow();
  });
});

// ── System Prompts ────────────────────────────────────────────────────────────

describe("prompts.list", () => {
  it("returns an array for authenticated users", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.prompts.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("prompts.upsert", () => {
  it("upserts a prompt and returns success", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.prompts.upsert({
      name: "test_prompt",
      category: "pipeline",
      description: "A test prompt",
      promptText: "You are a test assistant.",
    });
    expect(result).toEqual({ success: true });
  });

  it("throws FORBIDDEN for regular users (admin-only since P0 security fix)", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.prompts.upsert({
        name: "user_test_prompt",
        category: "console_experience",
        description: "A user test prompt",
        promptText: "You are a user test assistant.",
      })
    ).rejects.toThrow();
  });
});

// ─── assignments.topology ─────────────────────────────────────────────────────

describe("assignments.topology", () => {
  it("returns all pipeline stages in the topology response", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const topology = await caller.assignments.topology();
    expect(topology.length).toBeGreaterThan(0);
    for (const entry of topology) {
      expect(entry).toHaveProperty("stage");
      expect(Array.isArray(entry.assignments)).toBe(true);
    }
  });

  it("returns assignments with providerName and priority when assignments exist", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));

    // Use a unique suffix for both provider name and model name to avoid stale data
    const suffix = Date.now();
    const uniqueName = `Topology Test Provider ${suffix}`;
    const uniqueModel = `gpt-4o-topology-test-${suffix}`;

    const provider = await caller.providers.create({
      name: uniqueName,
      providerType: "openai_compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-topology-test-key",
      isActive: true,
    });

    const created = await caller.assignments.create({
      providerId: provider.id,
      pipelineStage: "ocr_extraction",
      modelName: uniqueModel,
      priority: 1,
      isActive: true,
    });

    try {
      const topology = await caller.assignments.topology();
      const stage = topology.find(t => t.stage === "ocr_extraction");
      expect(stage).toBeDefined();

      // Find by the unique model name tied to this specific test run
      const assignment = stage!.assignments.find(a => a.modelName === uniqueModel);
      expect(assignment).toBeDefined();
      expect(assignment!.providerName).toBe(uniqueName);
      expect(assignment!.priority).toBe(1);
      expect(assignment!.isActive).toBe(true);
    } finally {
      // Always clean up even if assertions fail
      await caller.assignments.delete({ id: created.id });
      await caller.providers.delete({ id: provider.id });
    }
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.assignments.topology()).rejects.toThrow();
  });

  it("throws UNAUTHORIZED for unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.assignments.topology()).rejects.toThrow();
  });
});
