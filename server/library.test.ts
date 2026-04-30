import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Test Context Helpers ───────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Library Tests ──────────────────────────────────────────────────────────

describe("library", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());

  let testDocId: number;
  let testPageId: number;

  describe("document CRUD (admin)", () => {
    it("creates a document", async () => {
      const result = await adminCaller.library.createDocument({
        filename: "test_phb.pdf",
        title: "Player's Handbook Test",
        gameSystem: "D&D",
        edition: "5e",
        publisher: "Wizards of the Coast",
        totalPages: 320,
      });
      expect(result.success).toBe(true);
      expect(result.id).toBeGreaterThan(0);
      testDocId = result.id;
    });

    it("lists documents", async () => {
      const docs = await userCaller.library.listDocuments();
      expect(Array.isArray(docs)).toBe(true);
      const found = docs.find(d => d.id === testDocId);
      expect(found).toBeDefined();
      expect(found!.title).toBe("Player's Handbook Test");
    });

    it("gets a document by ID", async () => {
      const doc = await userCaller.library.getDocument({ id: testDocId });
      expect(doc.filename).toBe("test_phb.pdf");
      expect(doc.gameSystem).toBe("D&D");
      expect(doc.status).toBe("pending");
    });

    it("updates a document", async () => {
      const result = await adminCaller.library.updateDocument({
        id: testDocId,
        status: "converting",
        processedPages: 10,
      });
      expect(result.success).toBe(true);

      const doc = await userCaller.library.getDocument({ id: testDocId });
      expect(doc.status).toBe("converting");
      expect(doc.processedPages).toBe(10);
    });

    it("returns NOT_FOUND for nonexistent document", async () => {
      await expect(userCaller.library.getDocument({ id: 999999 }))
        .rejects.toThrow("Document not found in the Library.");
    });

    it("non-admin cannot create documents", async () => {
      await expect(userCaller.library.createDocument({
        filename: "unauthorized.pdf",
      })).rejects.toThrow();
    });
  });

  describe("pages", () => {
    it("adds a page to a document (admin)", async () => {
      const result = await adminCaller.library.addPage({
        documentId: testDocId,
        pageNumber: 1,
        imageUrl: "https://example.com/page1.png",
        thumbnailUrl: "https://example.com/page1_thumb.png",
        phash: "abc123def456",
        imageWidth: 1200,
        imageHeight: 1600,
      });
      expect(result.success).toBe(true);
      expect(result.id).toBeGreaterThan(0);
      testPageId = result.id;
    });

    it("adds a second page", async () => {
      const result = await adminCaller.library.addPage({
        documentId: testDocId,
        pageNumber: 2,
        imageUrl: "https://example.com/page2.png",
      });
      expect(result.success).toBe(true);
    });

    it("gets pages for a document", async () => {
      const pages = await userCaller.library.getPages({ documentId: testDocId });
      expect(pages.length).toBe(2);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[1].pageNumber).toBe(2);
    });

    it("gets a page with OCR (no OCR yet)", async () => {
      const result = await userCaller.library.getPageWithOcr({ pageId: testPageId });
      expect(result.page.pageNumber).toBe(1);
      expect(result.ocrResult).toBeNull();
    });

    it("returns NOT_FOUND for nonexistent page", async () => {
      await expect(userCaller.library.getPageWithOcr({ pageId: 999999 }))
        .rejects.toThrow("Page not found.");
    });
  });

  describe("OCR results", () => {
    it("creates an OCR result for a page (admin)", async () => {
      const result = await adminCaller.library.upsertOcrResult({
        pageId: testPageId,
        rawText: "The ancient dragon breathes fire...",
        structuredData: { type: "monster", name: "Ancient Red Dragon", cr: 24 },
        confidence: 85,
        status: "pass2_complete",
        pass1Model: "llava-1.6",
        pass2Model: "gemini-2.5-pro",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("created");
    });

    it("gets page with OCR result", async () => {
      const result = await userCaller.library.getPageWithOcr({ pageId: testPageId });
      expect(result.ocrResult).not.toBeNull();
      expect(result.ocrResult!.rawText).toBe("The ancient dragon breathes fire...");
      expect(result.ocrResult!.confidence).toBe(85);
      expect(result.ocrResult!.pass2Model).toBe("gemini-2.5-pro");
    });

    it("updates an existing OCR result (upsert)", async () => {
      const result = await adminCaller.library.upsertOcrResult({
        pageId: testPageId,
        confidence: 92,
        status: "validated",
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe("updated");

      const pageData = await userCaller.library.getPageWithOcr({ pageId: testPageId });
      expect(pageData.ocrResult!.confidence).toBe(92);
      expect(pageData.ocrResult!.status).toBe("validated");
    });
  });

  describe("search", () => {
    it("searches documents by title", async () => {
      const results = await userCaller.library.searchDocuments({ query: "Handbook" });
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(d => d.id === testDocId)).toBe(true);
    });

    it("searches documents by game system", async () => {
      const results = await userCaller.library.searchDocuments({ query: "D&D" });
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns empty for no match", async () => {
      const results = await userCaller.library.searchDocuments({ query: "zzz_nonexistent_zzz" });
      expect(results.length).toBe(0);
    });
  });

  describe("document statuses", () => {
    it("returns available document statuses", async () => {
      const statuses = await userCaller.library.documentStatuses();
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses.some(s => s.id === "pending")).toBe(true);
      expect(statuses.some(s => s.id === "completed")).toBe(true);
    });
  });

  // Cleanup
  afterAll(async () => {
    try {
      await adminCaller.library.deleteDocument({ id: testDocId });
    } catch {
      // ignore cleanup errors
    }
  });
});

// ─── HITL Tests ─────────────────────────────────────────────────────────────

describe("hitl", () => {
  const adminCaller = appRouter.createCaller(createAdminContext());
  const userCaller = appRouter.createCaller(createUserContext());

  let testDocId: number;
  let testPageId: number;
  let testHitlId: number;

  beforeAll(async () => {
    // Create a document and page for HITL testing
    const docResult = await adminCaller.library.createDocument({
      filename: "hitl_test.pdf",
      title: "HITL Test Document",
      totalPages: 1,
    });
    testDocId = docResult.id;

    const pageResult = await adminCaller.library.addPage({
      documentId: testDocId,
      pageNumber: 1,
      imageUrl: "https://example.com/hitl_page.png",
    });
    testPageId = pageResult.id;

    // Add OCR result
    await adminCaller.library.upsertOcrResult({
      pageId: testPageId,
      rawText: "Goblin: AC 15, HP 7, Speed 30ft",
      confidence: 45,
      status: "pass2_complete",
    });
  });

  it("flags a page for HITL review", async () => {
    const result = await userCaller.hitl.flag({
      pageId: testPageId,
      reason: "Low confidence OCR result - possible table misalignment",
      flagCategory: "low_confidence",
      priority: "high",
    });
    expect(result.success).toBe(true);
    expect(result.id).toBeGreaterThan(0);
    testHitlId = result.id;
  });

  it("lists HITL queue items", async () => {
    const items = await userCaller.hitl.list();
    expect(Array.isArray(items)).toBe(true);
    const found = items.find(i => i.id === testHitlId);
    expect(found).toBeDefined();
    expect(found!.priority).toBe("high");
    expect(found!.status).toBe("queued");
  });

  it("lists with status filter", async () => {
    const queued = await userCaller.hitl.list({ status: "queued" });
    expect(queued.some(i => i.id === testHitlId)).toBe(true);

    const resolved = await userCaller.hitl.list({ status: "resolved" });
    expect(resolved.some(i => i.id === testHitlId)).toBe(false);
  });

  it("lists with priority filter", async () => {
    const high = await userCaller.hitl.list({ priority: "high" });
    expect(high.some(i => i.id === testHitlId)).toBe(true);

    const low = await userCaller.hitl.list({ priority: "low" });
    expect(low.some(i => i.id === testHitlId)).toBe(false);
  });

  it("gets a HITL item with full context", async () => {
    const detail = await userCaller.hitl.get({ id: testHitlId });
    expect(detail.item.reason).toContain("Low confidence");
    expect(detail.page).not.toBeNull();
    expect(detail.page!.pageNumber).toBe(1);
    expect(detail.ocrResult).not.toBeNull();
    expect(detail.ocrResult!.rawText).toContain("Goblin");
    expect(detail.document).not.toBeNull();
    expect(detail.document!.title).toBe("HITL Test Document");
  });

  it("returns NOT_FOUND for nonexistent HITL item", async () => {
    await expect(userCaller.hitl.get({ id: 999999 }))
      .rejects.toThrow("HITL item not found.");
  });

  it("gets HITL stats", async () => {
    const stats = await userCaller.hitl.stats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.queued).toBeGreaterThan(0);
    expect(typeof stats.inProgress).toBe("number");
    expect(typeof stats.resolved).toBe("number");
  });

  it("assigns a HITL item", async () => {
    const result = await userCaller.hitl.assign({
      id: testHitlId,
      assignedTo: 2,
    });
    expect(result.success).toBe(true);

    const detail = await userCaller.hitl.get({ id: testHitlId });
    expect(detail.item.status).toBe("in_progress");
    expect(detail.item.assignedTo).toBe(2);
  });

  it("resolves a HITL item with corrections", async () => {
    const result = await userCaller.hitl.resolve({
      id: testHitlId,
      correctedText: "Goblin: AC 15, HP 7, Speed 30 ft.",
      resolutionNotes: "Fixed spacing in 'Speed 30ft' -> 'Speed 30 ft.'",
    });
    expect(result.success).toBe(true);

    const detail = await userCaller.hitl.get({ id: testHitlId });
    expect(detail.item.status).toBe("resolved");
    expect(detail.item.resolutionNotes).toContain("Fixed spacing");
    // OCR result should be updated with correction
    expect(detail.ocrResult!.correctedText).toBe("Goblin: AC 15, HP 7, Speed 30 ft.");
    expect(detail.ocrResult!.status).toBe("corrected");
  });

  // Test skip and escalate with a new item
  let skipItemId: number;
  let escalateItemId: number;

  it("creates items for skip and escalate tests", async () => {
    const skip = await userCaller.hitl.flag({
      pageId: testPageId,
      reason: "Skip test item",
      priority: "low",
    });
    skipItemId = skip.id;

    const esc = await userCaller.hitl.flag({
      pageId: testPageId,
      reason: "Escalate test item",
      priority: "critical",
    });
    escalateItemId = esc.id;
  });

  it("skips a HITL item", async () => {
    const result = await userCaller.hitl.skip({
      id: skipItemId,
      resolutionNotes: "Not relevant for this review pass",
    });
    expect(result.success).toBe(true);

    const detail = await userCaller.hitl.get({ id: skipItemId });
    expect(detail.item.status).toBe("skipped");
  });

  it("escalates a HITL item", async () => {
    const result = await userCaller.hitl.escalate({
      id: escalateItemId,
      resolutionNotes: "Needs domain expert review",
    });
    expect(result.success).toBe(true);

    const detail = await userCaller.hitl.get({ id: escalateItemId });
    expect(detail.item.status).toBe("escalated");
  });

  // Cleanup
  afterAll(async () => {
    try {
      await adminCaller.library.deleteDocument({ id: testDocId });
    } catch {
      // ignore cleanup errors
    }
  });
});
