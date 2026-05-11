/**
 * POST /api/upload/ingest
 *
 * Accepts a PDF (or image) upload, saves it to the pipeline workspace,
 * creates an ingestion job, and fires the pipeline.
 * The temp file is cleaned up by the pipeline runner after processing.
 */

import { randomBytes } from "crypto";
import { mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import { join } from "path";
import { pipeline } from "stream/promises";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { createIngestionJob } from "./db";
import { startJob } from "./pipeline/runner";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

const router = Router();
const WORKSPACE = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";
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
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^(application\/pdf|image\/(png|jpeg|webp|tiff))$/.test(file.mimetype);
    cb(ok ? null : new Error("Only PDF and image files are accepted."), ok);
  },
});

function isPdfBuffer(buf: Buffer) {
  return buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-";
}

router.post(
  "/api/upload/ingest",
  requireAuth,
  upload.single("file"),
  async (req: Request & { authenticatedUser?: User }, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No file provided." });

      // PDF magic-byte check
      if (file.mimetype === "application/pdf" && !isPdfBuffer(file.buffer)) {
        return res.status(400).json({ error: "File does not appear to be a valid PDF." });
      }

      const uploadDir = join(WORKSPACE, "uploads");
      await mkdir(uploadDir, { recursive: true });

      const ext = file.originalname.match(/\.[^.]+$/)?.[0] ?? ".pdf";
      const fileName = `${randomBytes(12).toString("hex")}${ext}`;
      const destPath = join(uploadDir, fileName);

      // Write buffer to disk
      const ws = createWriteStream(destPath);
      await pipeline(
        (async function* () { yield file.buffer; })(),
        ws,
      );

      const gameSystem = (req.body.gameSystem as string | undefined)?.trim() || undefined;

      const jobId = await createIngestionJob({
        sourceFile: destPath,
        gameSystem,
        totalPages: 0,
        storageProvider: "local",
      } as any);

      startJob(jobId);

      return res.status(201).json({ success: true, jobId, filename: file.originalname });
    } catch (err: any) {
      console.error("[upload/ingest] Error:", err);
      return res.status(500).json({ error: "Upload failed." });
    }
  }
);

export { router as uploadIngestRouter };
