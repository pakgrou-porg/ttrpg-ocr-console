import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGoogleOAuthRoutes, registerLoginRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { uploadRouter } from "../uploadRoutes";
import { uploadIngestRouter } from "../uploadIngestRoute";
import { sdk } from "./sdk";
import { recoverQueuedJobs } from "../pipeline/runner";
import { exportDocumentBundle, getPagesByDocumentId, getOcrResultsByPageIds } from "../db";
import { readFile } from "fs/promises";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // tRPC path gets a large body limit to support bundle imports (can be tens of MB).
  // All other routes keep the default 1 MB guard.
  app.use("/api/trpc", express.json({ limit: "128mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  // Direct Google login (/api/auth/login, /api/auth/login/callback)
  registerLoginRoutes(app);
  // Google Drive OAuth routes (/api/auth/google, /api/auth/google/callback)
  registerGoogleOAuthRoutes(app);
  // Serve pipeline page PNGs for HITL review
  const pipelineWorkspace = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";
  app.use("/api/pipeline/pages", async (req, res, next) => {
    try {
      await sdk.authenticateRequest(req as any);
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized." });
    }
  }, express.static(pipelineWorkspace, {
    index: false,
    dotfiles: "deny",
    // Prevent browsers from serving stale images after in-place rotation correction.
    // no-cache means: cache locally but always revalidate with the server (ETag / Last-Modified).
    // The ?_v=<updatedAt> query param on each URL provides an additional URL-level version,
    // ensuring old cached entries are never reused after a page record changes.
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache");
    },
  }));
  // Direct bundle download — bypasses tRPC to avoid client-side JSON.stringify size limits.
  // Images are streamed one page at a time so 300+ page documents don't OOM the server.
  app.get("/api/download/bundle/:documentId", async (req, res) => {
    try {
      await sdk.authenticateRequest(req as any);
    } catch {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const documentId = parseInt(req.params.documentId, 10);
    if (!documentId || isNaN(documentId)) {
      res.status(400).json({ error: "Invalid documentId." });
      return;
    }
    const includeImages = req.query.images === "true";
    try {
      // Always fetch bundle WITHOUT images (fast, fits in memory).
      const bundle = await exportDocumentBundle(documentId, { includeImages: false });
      const suffix = includeImages ? "-with-images" : "";
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="document-${documentId}-bundle${suffix}.json"`);

      if (!includeImages) {
        // No images: bundle is small — safe to JSON.stringify in one shot.
        res.send(JSON.stringify(bundle, null, 2));
        return;
      }

      // Images requested: stream JSON, encoding one page image at a time to
      // avoid loading all PNGs into memory simultaneously.
      const rawPages = await getPagesByDocumentId(documentId);
      const rawPageByKey = new Map(rawPages.map(p => [`${p.pageNumber}:${p.partIndex}`, p]));

      // Write chunk and wait for drain if the socket is full.
      const writeChunk = (chunk: string): Promise<void> =>
        new Promise(resolve => { if (!res.write(chunk)) res.once("drain", resolve); else resolve(); });

      // Serialise everything except pages as the JSON "header".
      // Slice off the trailing "}" so we can append the pages array before closing.
      const { pages: bundlePages, ...headerMeta } = bundle;
      const headerJson = JSON.stringify({ ...headerMeta, includes_images: true }, null, 2);
      await writeChunk(headerJson.slice(0, -2)); // remove trailing "\n}"
      await writeChunk(',\n  "pages": [\n');

      for (let i = 0; i < bundlePages.length; i++) {
        const bp = bundlePages[i];
        const rawPage = rawPageByKey.get(`${bp.pageNumber}:${bp.partIndex}`);
        let pageObj: Record<string, unknown> = bp as unknown as Record<string, unknown>;
        if (rawPage?.rawPngUrl) {
          try {
            const bytes = await readFile(rawPage.rawPngUrl);
            pageObj = { ...bp, imageBase64: bytes.toString("base64") } as Record<string, unknown>;
          } catch { /* file missing — omit image for this page */ }
        }
        const comma = i < bundlePages.length - 1 ? "," : "";
        await writeChunk(`    ${JSON.stringify(pageObj)}${comma}\n`);
      }

      await writeChunk("  ]\n}\n");
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Export failed." });
      } else {
        res.end(); // headers already sent — just close the connection
      }
    }
  });

  // Unsloth JSONL download — streams one record per page to avoid OOM on large documents.
  // Each record may embed a base64 page image; loading them concurrently would spike RAM.
  app.get("/api/download/unsloth/:documentId", async (req, res) => {
    try {
      await sdk.authenticateRequest(req as any);
    } catch {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }
    const documentId = parseInt(req.params.documentId, 10);
    if (!documentId || isNaN(documentId)) {
      res.status(400).json({ error: "Invalid documentId." });
      return;
    }
    try {
      const pages = await getPagesByDocumentId(documentId);
      if (pages.length === 0) { res.status(404).json({ error: "No pages found." }); return; }

      const pageIds = pages.map(p => p.id);
      const ocrs = await getOcrResultsByPageIds(pageIds).catch(() => []);
      const ocrMap = new Map(ocrs.map(r => [r.pageId, r]));

      // Pre-check: is there anything to export?
      const hasData = pages.some(p => {
        const ocr = ocrMap.get(p.id);
        const regions = Array.isArray(p.contentRegions) ? p.contentRegions as any[] : [];
        return (ocr?.rawText) || regions.length > 0;
      });
      if (!hasData) { res.status(204).end(); return; }

      res.setHeader("Content-Type", "application/jsonl");
      res.setHeader("Content-Disposition", `attachment; filename="document-${documentId}-unsloth.jsonl"`);

      const writeChunk = (chunk: string): Promise<void> =>
        new Promise(resolve => { if (!res.write(chunk)) res.once("drain", resolve); else resolve(); });

      for (const page of pages) {
        const ocr = ocrMap.get(page.id);
        const regions = Array.isArray(page.contentRegions) ? (page.contentRegions as any[]) : [];
        if (!ocr && regions.length === 0) continue;

        let assistantContent = "";
        if (regions.length > 0) {
          for (const r of regions) {
            const { x = 0, y = 0, w = 0, h = 0 } = r.bbox ?? {};
            const regionType = (r.type ?? r.regionType ?? "unknown").toLowerCase();
            const text = (r.text ?? r.content ?? "").trim();
            assistantContent += `<extra_id_0>${regionType}<extra_id_1>${Math.round(x * 10)} ${Math.round(y * 10)} ${Math.round((x + w) * 10)} ${Math.round((y + h) * 10)}<extra_id_2>${text}<extra_id_3>`;
          }
        } else if (ocr?.rawText) {
          assistantContent = `<extra_id_0>page<extra_id_1>0 0 1000 1000<extra_id_2>${ocr.rawText.trim()}<extra_id_3>`;
        }
        if (!assistantContent) continue;

        let imageEntry: { type: string; image: string } | null = null;
        if (page.rawPngUrl) {
          try {
            const bytes = await readFile(page.rawPngUrl);
            imageEntry = { type: "image", image: `data:image/png;base64,${bytes.toString("base64")}` };
          } catch { /* file missing */ }
        }

        const record = {
          messages: [
            {
              role: "user",
              content: [
                ...(imageEntry ? [imageEntry] : []),
                { type: "text", text: "Identify and extract all text regions from this document page. For each region, output its semantic type, bounding box, and text content." },
              ],
            },
            { role: "assistant", content: assistantContent },
          ],
          metadata: { documentId, pageId: page.id, pageNumber: page.pageNumber, layoutType: page.layoutType ?? null, confidence: page.ocrConfidence ?? null },
        };
        await writeChunk(JSON.stringify(record) + "\n");
      }
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Export failed." });
      } else {
        res.end();
      }
    }
  });

  // File upload REST endpoints
  app.use(uploadRouter);
  app.use(uploadIngestRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");

  // P1: In production, the platform assigns a specific port via PORT env var.
  // Auto-fallback is only safe in development; in production a port conflict
  // means the deployment is misconfigured and should fail loudly.
  let port: number;
  if (process.env.NODE_ENV === "production") {
    port = preferredPort;
  } else {
    port = await findAvailablePort(preferredPort);
    if (port !== preferredPort) {
      console.log(`[Dev] Port ${preferredPort} is busy, using port ${port} instead`);
    }
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Re-enqueue any jobs that were queued when the server last stopped.
    // Delay slightly so the DB connection pool is fully warmed before querying.
    setTimeout(() => {
      recoverQueuedJobs().catch(err =>
        console.error("[Pipeline] Failed to recover queued jobs:", err.message)
      );
    }, 3000);
  });
}

startServer().catch(console.error);
