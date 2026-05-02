import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { encryptSecret, decryptSecret, storeSecretHint, renderMaskedSecret } from "./crypto";
import type { TrpcContext } from "./_core/context";

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = makeUser()): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return makeCtx(null);
}

// ─── Crypto: encryptSecret / decryptSecret round-trip ─────────────────────────

describe("crypto: encryptSecret / decryptSecret", () => {
  it("round-trips a short string", () => {
    const plaintext = "sk-test-1234";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const plaintext = "same-secret";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("round-trips a long API key", () => {
    const key = "sk-or-v1-" + "a".repeat(64);
    expect(decryptSecret(encryptSecret(key))).toBe(key);
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encryptSecret("secret");
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -4) + "XXXX" };
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("throws on tampered auth tag", () => {
    const encrypted = encryptSecret("secret");
    const tampered = { ...encrypted, authTag: "00000000000000000000000000000000" };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

// ─── Crypto: secret hint storage ─────────────────────────────────────────────

describe("crypto: storeSecretHint / renderMaskedSecret", () => {
  it("stores correct prefix, suffix, and length", () => {
    const hint = storeSecretHint("sk-abcdef1234567890wxyz");
    expect(hint.keyPrefix).toBe("sk-a");
    expect(hint.keySuffix).toBe("wxyz"); // last 4 chars
    // "sk-abcdef1234567890wxyz" = 23 chars
    expect(hint.keyLength).toBe(23);
  });

  it("renders a masked display string", () => {
    const hint = storeSecretHint("sk-abcdef1234567890wxyz");
    const masked = renderMaskedSecret(hint);
    expect(masked).toMatch(/^sk-a/);
    expect(masked).toMatch(/wxyz$/);
    expect(masked).toContain("•");
  });

  it("handles short keys gracefully (≤ 8 chars)", () => {
    const hint = storeSecretHint("abc");
    expect(hint.keyLength).toBe(3);
    const masked = renderMaskedSecret(hint);
    expect(typeof masked).toBe("string");
    expect(masked.length).toBeGreaterThan(0);
  });

  it("never exposes the full key in the masked output", () => {
    const secret = "sk-or-v1-supersecretkey1234567890";
    const hint = storeSecretHint(secret);
    const masked = renderMaskedSecret(hint);
    // The masked string should not contain the middle portion of the key
    expect(masked).not.toContain("supersecretkey");
  });
});

// ─── Admin-only procedure enforcement ────────────────────────────────────────
// The adminProcedure in routers.ts throws: "The Conclave is for administrators only."

describe("prompts.upsert: admin-only enforcement", () => {
  it("throws FORBIDDEN for regular user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.prompts.upsert({
        name: "test-prompt",
        category: "ocr",
        promptText: "You are a helpful assistant.",
        version: "1.0",
      })
    ).rejects.toThrow(/Conclave|administrators only|FORBIDDEN/i);
  });

  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.prompts.upsert({
        name: "test-prompt",
        category: "ocr",
        promptText: "You are a helpful assistant.",
        version: "1.0",
      })
    ).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

describe("prompts.seedDefaults: admin-only enforcement", () => {
  it("throws FORBIDDEN for regular user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.prompts.seedDefaults()).rejects.toThrow(/Conclave|administrators only|FORBIDDEN/i);
  });
});

describe("telemetry.record: admin-only enforcement", () => {
  it("throws FORBIDDEN for regular user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.telemetry.record({
        eventType: "ocr_complete",
        source: "pipeline",
        metricValue: 1,
      })
    ).rejects.toThrow(/Conclave|administrators only|FORBIDDEN/i);
  });

  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.telemetry.record({
        eventType: "ocr_complete",
        source: "pipeline",
        metricValue: 1,
      })
    ).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

// ─── Health endpoint: public ping vs protected detail ─────────────────────────

describe("health.ping: public endpoint", () => {
  it("returns ok without authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const result = await caller.health.ping();
    expect(result).toEqual({ ok: true });
  });

  it("returns ok for authenticated users too", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.health.ping();
    expect(result).toEqual({ ok: true });
  });
});

describe("health.database: protected endpoint", () => {
  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.health.database()).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

describe("health.all: protected endpoint", () => {
  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.health.all()).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

// ─── Library.createDocument: admin-only enforcement ──────────────────────────

describe("library.createDocument: admin-only enforcement", () => {
  it("throws FORBIDDEN for regular user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.library.createDocument({
        filename: "test_book.pdf",
        gameSystem: "D&D 5e",
      })
    ).rejects.toThrow(/Conclave|administrators only|FORBIDDEN/i);
  });
});

// ─── Pipeline procedures: require authentication ──────────────────────────────

describe("pipeline.ingestPage: requires authentication", () => {
  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.pipeline.ingestPage({
        documentId: 1,
        pageNumber: 1,
        imageUrl: "https://example.com/page1.png",
        phash: "abc123",
      })
    ).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

describe("pipeline.submitOcrResult: requires authentication", () => {
  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.pipeline.submitOcrResult({
        pageId: 1,
        rawText: "Test",
        confidence: 85,
      })
    ).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});

describe("pipeline.flagPage: requires authentication", () => {
  it("throws UNAUTHORIZED for anonymous user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.pipeline.flagPage({
        pageId: 1,
        reason: "Test flag",
      })
    ).rejects.toThrow(/UNAUTHORIZED|login/i);
  });
});
