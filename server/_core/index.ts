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
import { exportDocumentBundle, getPagesByDocumentId } from "../db";
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
  // P1: Global body limit is 1 MB for JSON/urlencoded requests.
  // File uploads use the /api/upload/* routes which have their own multer limits.
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
