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
