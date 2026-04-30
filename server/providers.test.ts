import { describe, expect, it, beforeAll } from "vitest";
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
      providerType: "lm_studio",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "",
    });
    expect(result).toHaveProperty("id");
    expect(result.success).toBe(true);
  });

  it("masks API keys when listing providers", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // First create a provider with a real key
    await caller.providers.create({
      name: `OpenRouter Masked ${suffix}`,
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
  });

  it("allows admin to delete a provider", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const created = await caller.providers.create({
      name: `To Delete ${suffix}`,
      providerType: "openai_compatible",
      baseUrl: "http://localhost:9999",
      apiKey: "",
    });
    const result = await caller.providers.delete({ id: created.id });
    expect(result.success).toBe(true);
  });
});

describe("assignments (Model Assignment Matrix)", () => {
  it("lists available pipeline stages", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const stages = await caller.assignments.stages();
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBeGreaterThan(0);
    expect(stages.some((s: any) => s.id === "layout_analysis")).toBe(true);
  });

  it("denies non-admin from creating assignments", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.assignments.create({
        pipelineStage: "layout_analysis",
        providerId: 1,
        modelName: "llava-v1.6",
        priority: 1,
      })
    ).rejects.toThrow();
  });

  it("allows admin to list assignments", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const list = await caller.assignments.list();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe("connections (Database Connection Config)", () => {
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
