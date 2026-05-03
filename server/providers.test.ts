import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@kodex.io",
    name: "Arch-Magister",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "scholar@kodex.io",
    name: "Scholar",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const suffix = nanoid(6);

describe("providers (LLM Provider Registry)", () => {
  it("lists available provider types", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const types = await caller.providers.types();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types.some((t: any) => t.id === "openai_compatible")).toBe(true);
  });

  it("denies non-admin from creating providers", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.providers.create({
        name: "Test Provider",
        providerType: "openai_compatible",
        baseUrl: "http://localhost:1234",
        apiKey: "sk-test-key",
      })
    ).rejects.toThrow();
  });

  it("allows admin to create a provider", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.providers.create({
      name: `LM Studio Local ${suffix}`,
      displayName: `LM Studio Local ${suffix}`,
      providerType: "lm_studio",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "",
    });
    expect(result).toHaveProperty("id");
    expect(result.success).toBe(true);
    // Cleanup: remove the test row so it doesn't pollute the provider registry
    await caller.providers.delete({ id: result.id });
  });

  it("masks API keys when listing providers", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // First create a provider with a real key
    const created = await caller.providers.create({
      name: `OpenRouter Masked ${suffix}`,
      displayName: `OpenRouter Masked ${suffix}`,
      providerType: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-abcdefghijklmnop",
    });
    const list = await caller.providers.list();
    const found = list.find((p: any) => p.name === `OpenRouter Masked ${suffix}`);
    expect(found).toBeDefined();
    // API key should be masked (not the raw value)
    expect(found!.hasApiKey).toBe(true);
    expect(found!.maskedApiKey).toBeDefined();
    expect(found!.maskedApiKey).not.toBe("sk-or-v1-abcdefghijklmnop");
    // Cleanup: remove the test row so it doesn't pollute the provider registry
    await caller.providers.delete({ id: created.id });
  });

  it("allows admin to delete a provider", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const created = await caller.providers.create({
      name: `To Delete ${suffix}`,
      displayName: `To Delete ${suffix}`,
      providerType: "openai_compatible",
      baseUrl: "http://localhost:9999",
      apiKey: "",
    });
    const result = await caller.providers.delete({ id: created.id });
    expect(result.success).toBe(true);
  });
});

describe("assignments (Stage Inscription Registry)", () => {
  it("lists available pipeline stages", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const stages = await caller.assignments.stages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((s: any) => s.id === "layout_analysis")).toBe(true);
  });

  it("denies non-admin from upserting inscriptions", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.assignments.upsert({
        stage: "layout_analysis",
        primaryProviderId: 1,
      })
    ).rejects.toThrow();
  });

  it("allows admin to list inscriptions", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const list = await caller.assignments.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it("allows admin to upsert and delete an inscription", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Create a provider first
    const provider = await caller.providers.create({
      name: `Inscription Test Provider ${suffix}`,
      displayName: `Inscription Test Provider ${suffix}`,
      providerType: "lm_studio",
      baseUrl: "http://localhost:1234/v1",
    });
    // Upsert an inscription for bbox_detection
    const result = await caller.assignments.upsert({
      stage: "bbox_detection",
      primaryProviderId: provider.id,
      promptName: "layout_analysis_prompt",
      temperature: 0.1,
    });
    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    // Verify it appears in the list
    const list = await caller.assignments.list();
    const found = list.find((i: any) => i.stage === "bbox_detection" && i.primaryProvider?.id === provider.id);
    expect(found).toBeDefined();
    // Cleanup
    await caller.assignments.delete({ id: result.id });
    await caller.providers.delete({ id: provider.id });
  });
});

describe("providers.test (Test Connection & Model Discovery)", () => {
  it("returns NOT_FOUND for non-existent provider", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(caller.providers.test({ id: 999999 })).rejects.toThrow("Provider not found");
  });

  it("denies non-admin from testing a provider", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.providers.test({ id: 1 })).rejects.toThrow();
  });

  it("returns ok:false for unreachable provider URL", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Create a provider with an unreachable URL
    const created = await caller.providers.create({
      name: `Unreachable Provider ${suffix}`,
      displayName: `Unreachable Provider ${suffix}`,
      providerType: "openai_compatible",
      baseUrl: "http://192.0.2.1:9999/v1",
      apiKey: "sk-test-unreachable",
    });
    const result = await caller.providers.test({ id: created.id });
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.error).toBeDefined();
    // Cleanup
    await caller.providers.delete({ id: created.id });
  }, 15000);

  it("returns ok:false for provider with invalid URL (bad hostname)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const created = await caller.providers.create({
      name: `Bad Hostname ${suffix}`,
      displayName: `Bad Hostname ${suffix}`,
      providerType: "openai_compatible",
      baseUrl: "http://this-host-does-not-exist-xyz123.invalid/v1",
    });
    const result = await caller.providers.test({ id: created.id });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // Cleanup
    await caller.providers.delete({ id: created.id });
  });

  it("returns ok:true and models array when provider responds correctly", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Use OpenRouter's public /models endpoint (no API key required)
    // baseUrl is host-only; apiPrefix is the path prefix before /models
    const created = await caller.providers.create({
      name: `OpenRouter Discovery Test ${suffix}`,
      displayName: `OpenRouter Discovery Test ${suffix}`,
      providerType: "openrouter",
      baseUrl: "https://openrouter.ai",
      apiPrefix: "/api/v1",
    });
    const result = await caller.providers.test({ id: created.id });
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(Array.isArray(result.models)).toBe(true);
    expect(result.models!.length).toBeGreaterThan(0);
    // Verify that models were cached in the DB
    const provider = await caller.providers.get({ id: created.id });
    expect((provider.availableModels as string[]).length).toBeGreaterThan(0);
    // Cleanup
    await caller.providers.delete({ id: created.id });
  }, 15000);

  it("works for provider without API key (e.g., local LM Studio)", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Create a provider with no API key and a URL that will refuse connection quickly
    const created = await caller.providers.create({
      name: `No Key Provider ${suffix}`,
      displayName: `No Key Provider ${suffix}`,
      providerType: "lm_studio",
      baseUrl: "http://127.0.0.1:19999/v1",
    });
    const result = await caller.providers.test({ id: created.id });
    // Should fail (connection refused) but not throw
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.error).toBeDefined();
    // Cleanup
    await caller.providers.delete({ id: created.id });
  }, 15000);
});

describe("connections (Database Connection Config)", () => {
  // Clean up any rows this describe block creates, regardless of test outcome.
  // Without this, every test run leaves orphaned rows in the live DB.
  afterAll(async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const all = await caller.connections.list();
    const testPrefixes = [
      `Test Supabase ${suffix}`,
      `Test Connection Ping ${suffix}`,
      `To Delete Connection ${suffix}`,
    ];
    for (const conn of all) {
      if (testPrefixes.includes(conn.name)) {
        try { await caller.connections.delete({ id: conn.id }); } catch {}
      }
    }
  });

  it("lists available connection types", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const types = await caller.connections.types();
    expect(Array.isArray(types)).toBe(true);
    expect(types.some((t: any) => t.id === "supabase_cloud")).toBe(true);
    expect(types.some((t: any) => t.id === "postgres_docker")).toBe(true);
  });

  it("denies non-admin from creating connections", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.connections.create({
        name: "Local Docker",
        connectionType: "postgres_docker",
        host: "localhost",
        port: 5432,
        databaseName: "ttrpg_ocr",
        username: "postgres",
        password: "secret",
      })
    ).rejects.toThrow();
  });

  it("allows admin to create a connection", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.connections.create({
      name: `Test Supabase ${suffix}`,
      connectionType: "supabase_cloud",
      host: "db.test.supabase.co",
      port: 5432,
      databaseName: "postgres",
      username: "postgres",
      password: "test-password-123",
    });
    expect(result).toHaveProperty("id");
  });

  it("allows admin to test a connection", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const created = await caller.connections.create({
      name: `Test Connection Ping ${suffix}`,
      connectionType: "postgres_docker",
      host: "localhost",
      port: 5432,
      databaseName: "test_db",
      username: "user",
      password: "pass",
    });
    // Test will fail since the host doesn't exist, but the procedure should not throw
    const result = await caller.connections.test({ id: created.id });
    expect(result).toHaveProperty("ok");
    expect(typeof result.ok).toBe("boolean");
  });

  it("allows admin to delete a connection", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const created = await caller.connections.create({
      name: `To Delete Connection ${suffix}`,
      connectionType: "postgres_docker",
      host: "localhost",
      port: 5432,
      databaseName: "deleteme",
      username: "user",
      password: "pass",
    });
    const result = await caller.connections.delete({ id: created.id });
    expect(result.success).toBe(true);
  });
});
