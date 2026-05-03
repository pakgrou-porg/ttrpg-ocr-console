/**
 * REST upload routes for document ingestion.
 * Handles multipart/form-data PDF uploads, stores the file in S3,
 * and creates a document record in the database.
 *
 * POST /api/upload/document
 *   - Requires authenticated session
 *   - Accepts: multipart/form-data with fields:
 *       file        (required) — the PDF file (max 200 MB)
 *       title       (optional) — human-readable title
 *       gameSystem  (optional) — e.g. "D&D 5e"
 *       edition     (optional) — e.g. "5th Edition"
 *       publisher   (optional) — e.g. "Wizards of the Coast"
 *
 * P0 Security fixes:
 *   1. Authentication middleware runs BEFORE Multer file parsing so unauthenticated
 *      callers are rejected before any file bytes are read into memory.
 *   2. PDF validation checks magic bytes (%PDF-) in addition to MIME type, since
 *      MIME type is client-controlled and trivially forgeable.
 *   3. S3 keys use nanoid + user-scoped paths; original filename is stored only as
 *      metadata and never appears in the canonical object key.
 */

import { randomBytes } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createDocument } from "./db";
import { sdk } from "./_core/sdk";
import type { User } from "../drizzle/schema";

const router = Router();

// ── Auth middleware ──────────────────────────────────────────────────────────
// Must run BEFORE upload.single() so unauthenticated requests are rejected
// before Multer reads any file bytes into memory (prevents memory exhaustion DoS).

async function requireAuth(
  req: Request & { authenticatedUser?: User },
  res: Response,
  next: NextFunction
) {
  try {
    const user = await sdk.authenticateRequest(req as any);
    req.authenticatedUser = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized. Please log in." });
  }
}

// ── Multer configuration ─────────────────────────────────────────────────────
// Memory storage is acceptable here because we immediately stream the buffer to
// S3. For very large files (> 200 MB) consider switching to disk storage and
// streaming directly from disk to S3.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max (memory storage)
  },
  fileFilter: (_req, file, cb) => {
    // Accept only application/pdf MIME type as a first-pass filter.
    // Magic-byte validation happens after the buffer is available (see below).
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted."));
    }
  },
});

// ── PDF magic-byte validation ────────────────────────────────────────────────
// MIME type is client-controlled; validate the actual file header.
// All valid PDFs start with the 5-byte sequence "%PDF-".

function isPdfBuffer(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

// ── Randomized S3 key generation ─────────────────────────────────────────────
// Keys are user-scoped and use a random ID — the original filename never appears
// in the canonical key to avoid enumeration and collision.

function generateS3Key(userId: number): string {
  const randomId = randomBytes(16).toString("hex");
  return `documents/${userId}/${randomId}/source.pdf`;
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post(
  "/api/upload/document",
  requireAuth,            // ← Auth BEFORE Multer (P0 fix)
  upload.single("file"),  // ← File parsing only for authenticated users
  async (req: Request & { authenticatedUser?: User }, res: Response) => {
    try {
      const user = req.authenticatedUser!;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file provided." });
      }

      // P0: Validate PDF magic bytes — MIME type alone is not sufficient
      if (!isPdfBuffer(file.buffer)) {
        return res.status(400).json({
          error: "File does not appear to be a valid PDF (invalid header).",
        });
      }

      // Extract metadata from form fields
      const title = (req.body.title as string | undefined)?.trim() || undefined;
      const gameSystem = (req.body.gameSystem as string | undefined)?.trim() || undefined;
      const edition = (req.body.edition as string | undefined)?.trim() || undefined;
      const publisher = (req.body.publisher as string | undefined)?.trim() || undefined;

      // P1: Randomized, user-scoped S3 key — original filename stored as metadata only
      const s3Key = generateS3Key(user.id);

      // Upload to S3
      const { url: pdfUrl } = await storagePut(s3Key, file.buffer, "application/pdf");

      // Create the document record with ownership fields
      let doc;
      try {
        doc = await createDocument({
          filename: file.originalname,
          title,
          gameSystem,
          edition,
          publisher,
          pdfUrl,
          totalPages: 0,
          status: "pending",
          ownerUserId: user.id,
          createdByUserId: user.id,
          visibility: "private",
        });
      } catch (dbErr) {
        console.error("[upload/document] DB insert failed after S3 upload. Orphaned key:", s3Key, dbErr);
        return res.status(500).json({ error: "Upload failed. Please try again." });
      }

      return res.status(201).json({
        success: true,
        id: doc.id,
        filename: file.originalname,
        pdfUrl,
        message: "Document registered. The pipeline will process it shortly.",
      });
    } catch (err: any) {
      console.error("[upload/document] Error:", err);
      return res.status(500).json({ error: "Upload failed. Please try again." });
    }
  }
);

export { router as uploadRouter };
