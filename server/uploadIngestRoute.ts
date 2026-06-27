/**
 * POST /api/upload/ingest
 *
 * Accepts a PDF (or image) upload, saves it to the pipeline workspace,
 * creates an ingestion job, and fires the pipeline.
 * The temp file is cleaned up by the pipeline runner after processing.
 */

import { randomBytes } from "crypto";
import { mkdir, open, rename, unlink } from "fs/promises";
import { mkdirSync } from "fs";
import { extname, basename, join } from "path";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { createIngestionJob } from "./db";
import { startJob } from "./pipeline/runner";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

const router = Router();
const WORKSPACE = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";
const UPLOAD_DIR = join(WORKSPACE, "uploads");
const MAX_UPLOAD_MB = 200;

async function requireAuth(req: Request & { authenticatedUser?: User }, res: Response, next: NextFunction) {
  try {
    req.authenticatedUser = await sdk.authenticateRequest(req as any);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized." });
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      } catch (err) {
        cb(err as Error, UPLOAD_DIR);
      }
    },
    filename: (_req, file, cb) => {
      const extByMime: Record<string, string> = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/tiff": ".tiff",
      };
      cb(null, `${randomBytes(12).toString("hex")}${extByMime[file.mimetype] ?? ".bin"}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(application\/pdf|image\/(png|jpeg|webp|tiff))$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PDF and image files are accepted."), ok);
  },
});

async function isPdfFile(path: string) {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(5);
    const { bytesRead } = await handle.read(buffer, 0, 5, 0);
    return bytesRead === 5 && buffer.toString("ascii") === "%PDF-";
  } finally {
    await handle.close();
  }
}

router.post(
  "/api/upload/ingest",
  requireAuth,
  upload.single("file"),
  async (req: Request & { authenticatedUser?: User }, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file provided." });

      if (file.mimetype === "application/pdf" && !(await isPdfFile(file.path))) {
        await unlink(file.path).catch(() => undefined);
        return res.status(400).json({ error: "File does not appear to be a valid PDF." });
      }

      await mkdir(UPLOAD_DIR, { recursive: true });

      const gameSystem = (req.body.gameSystem as string | undefined)?.trim() || undefined;

      // Rename the temp file to a sanitized version of the original name so that
      // the document shows up with a meaningful title in the Chronicles if the
      // document_intelligence stage can't extract a canonical title.
      const ext = extname(file.originalname) || extname(file.path);
      const safeName = basename(file.originalname, extname(file.originalname))
        .replace(/[^\w\s.-]/g, "")   // strip shell-unsafe chars
        .replace(/\s+/g, "_")
        .slice(0, 120);
      const namedPath = join(UPLOAD_DIR, `${safeName}_${randomBytes(6).toString("hex")}${ext}`);
      await rename(file.path, namedPath);

      const jobId = await createIngestionJob({
        sourceFile: namedPath,
        gameSystem,
        totalPages: 0,
        storageProvider: "local",
      } as any);

      startJob(jobId);

      return res.status(201).json({ success: true, jobId, filename: file.originalname });
    } catch (err: any) {
      // Clean up whichever file exists — the rename may or may not have happened
      if (req.file?.path) await unlink(req.file.path).catch(() => undefined);
      console.error("[upload/ingest] Error:", err);
      return res.status(500).json({ error: "Upload failed." });
    }
  }
);

export { router as uploadIngestRouter };
