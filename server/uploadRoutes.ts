/**
 * REST upload routes for document ingestion.
 * Handles multipart/form-data PDF uploads, stores the file in S3,
 * and creates a document record in the database.
 *
 * POST /api/upload/document
 *   - Requires authenticated session (protectedProcedure equivalent)
 *   - Accepts: multipart/form-data with fields:
 *       file        (required) — the PDF file
 *       title       (optional) — human-readable title
 *       gameSystem  (optional) — e.g. "D&D 5e"
 *       edition     (optional) — e.g. "5th Edition"
 *       publisher   (optional) — e.g. "Wizards of the Coast"
 */

import { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createDocument } from "./db";
import { sdk } from "./_core/sdk";

const router = Router();

// Use memory storage — we'll stream the buffer to S3
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are accepted."));
    }
  },
});

router.post(
  "/api/upload/document",
  upload.single("file"),
  async (req, res) => {
    try {
      // Auth check — require a valid session
      let user;
      try {
        user = await sdk.authenticateRequest(req as any);
      } catch {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file provided." });
      }

      // Extract metadata from form fields
      const title = (req.body.title as string | undefined)?.trim() || undefined;
      const gameSystem = (req.body.gameSystem as string | undefined)?.trim() || undefined;
      const edition = (req.body.edition as string | undefined)?.trim() || undefined;
      const publisher = (req.body.publisher as string | undefined)?.trim() || undefined;

      // Generate a unique S3 key
      const timestamp = Date.now();
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const s3Key = `documents/pdfs/${timestamp}-${safeName}`;

      // Upload to S3
      const { url: pdfUrl } = await storagePut(s3Key, file.buffer, "application/pdf");

      // Create the document record
      const docId = await createDocument({
        filename: file.originalname,
        title,
        gameSystem,
        edition,
        publisher,
        pdfUrl,
        totalPages: 0, // Will be updated by the pipeline after conversion
        status: "pending",
      });

      return res.status(201).json({
        success: true,
        id: docId,
        filename: file.originalname,
        pdfUrl,
        message: "Document registered. The pipeline will process it shortly.",
      });
    } catch (err: any) {
      console.error("[upload/document] Error:", err);
      return res.status(500).json({ error: err.message ?? "Upload failed." });
    }
  }
);

export { router as uploadRouter };
