import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, mkdir, readdir } from "fs/promises";
import { join, basename } from "path";
import {
  getIngestionJobById, updateIngestionJobStatus,
  createIngestionJob,
  createDocument, updateDocument,
  createDocumentPage, updateDocumentPage,
  createOcrResult, createHitlItem,
} from "../db";
import { invokeStage, parseJsonResponse, UserContentPart } from "./invoke";
import { downloadDriveFile, getDriveFileName, deleteLocalFile } from "./drive";

const execFileAsync = promisify(execFile);

const WORKSPACE = process.env.PIPELINE_WORKSPACE ?? "/app/workspace";

// ── Public entry point ────────────────────────────────────────────────────────

export function startJob(jobId: number): void {
  setImmediate(() => {
    runJob(jobId).catch(err => {
      console.error(`[Pipeline] Job ${jobId} unhandled error:`, err);
    });
  });
}

// ── Internal runner ───────────────────────────────────────────────────────────

async function runJob(jobId: number): Promise<void> {
  console.log(`[Pipeline] Starting job ${jobId}`);
  try {
    await _runJob(jobId);
  } catch (err: any) {
    console.error(`[Pipeline] Job ${jobId} failed:`, err.message);
    await updateIngestionJobStatus(jobId, {
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).catch(() => {});
  }
}

async function _runJob(jobId: number): Promise<void> {
  const job = await getIngestionJobById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const pageOffset = (job as any).pageOffset ?? 0;
  const blockSize  = (job as any).blockSize  ?? 10;

  // ── Stage: document_registration ───────────────────────────────────────────
  await updateIngestionJobStatus(jobId, {
    status: "converting",
    currentPhase: 1,
    currentStage: "document_registration",
    startedAt: new Date(),
  });

  const jobWorkspace = join(WORKSPACE, String(jobId));
  const pagesDir = join(jobWorkspace, "pages");
  await mkdir(pagesDir, { recursive: true });

  // ── Resolve source file (local path or Drive download) ──────────────────────
  let sourceFile = job.sourceFile;
  let tempDownloadPath: string | null = null;

  if ((job as any).storageProvider === "google_drive" && (job as any).driveFileId) {
    await updateIngestionJobStatus(jobId, { currentStage: "downloading_source" });
    const driveFileId = (job as any).driveFileId as string;
    const fileName = await getDriveFileName(driveFileId);
    tempDownloadPath = join(jobWorkspace, fileName);
    await downloadDriveFile(driveFileId, tempDownloadPath);
    sourceFile = tempDownloadPath;
    console.log(`[Pipeline] Job ${jobId}: downloaded "${fileName}" from Google Drive`);
  }

  const createdDoc = await createDocument({
    filename: basename(sourceFile),
    gameSystem: job.gameSystem ?? undefined,
    status: "phase1_non_ocr",
    ingestionJobId: jobId,
  });
  const documentId = createdDoc.id;

  // ── Stage: pdf_to_png ─────────────────────────────────────────────────────
  await updateIngestionJobStatus(jobId, { currentStage: "pdf_to_png" });

  // Count total pages so we know whether to chain a follow-up job
  const totalDocPages = /\.pdf$/i.test(sourceFile)
    ? await countPdfPages(sourceFile)
    : 1;

  const firstPage = pageOffset + 1;
  const lastPage  = pageOffset + blockSize;

  console.log(`[Pipeline] Job ${jobId}: converting pages ${firstPage}–${Math.min(lastPage, totalDocPages)} of ${totalDocPages}…`);

  let pageFiles = await convertToPages(sourceFile, pagesDir, firstPage, Math.min(lastPage, totalDocPages));
  if (pageFiles.length === 0) throw new Error("No pages produced from source file");

  // Delete the Drive temp download now that pages are extracted
  if (tempDownloadPath) await deleteLocalFile(tempDownloadPath);

  await updateIngestionJobStatus(jobId, { totalPages: pageFiles.length });
  console.log(`[Pipeline] Job ${jobId}: ${pageFiles.length} pages in this block`);

  // Create documentPage records for all pages upfront
  const pageIds: number[] = [];
  for (let i = 0; i < pageFiles.length; i++) {
    const page = await createDocumentPage({
      documentId,
      pageNumber: pageOffset + i + 1,
      rawPngUrl: pageFiles[i],
    });
    pageIds.push(page.id);
  }

  // ── Stage: document_intelligence (first block only) ───────────────────────
  if (pageOffset === 0) {
    await updateIngestionJobStatus(jobId, {
      status: "pass1_ocr",
      currentStage: "document_intelligence",
    });

    const sampleFiles = pageFiles.slice(0, Math.min(2, pageFiles.length));
    try {
      const sampleContent: UserContentPart[] = [];
      for (const f of sampleFiles) sampleContent.push(await imageContent(f));
      sampleContent.push({ type: "text", text: "Analyze these document pages and extract the metadata." });

      const result = await invokeStage("document_intelligence", sampleContent);
      const meta = parseJsonResponse(result.content);

      await updateDocument(documentId, {
        title: (meta.canonical_title as string) || undefined,
        publisher: (meta.publisher as string) || undefined,
        documentType: (meta.document_type as string) || undefined,
        documentSummary: (meta.document_summary as string) || undefined,
      });
      console.log(`[Pipeline] Job ${jobId}: document_intelligence — "${meta.canonical_title}"`);
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId}: document_intelligence failed (continuing): ${err.message}`);
      await updateDocument(documentId, { title: basename(sourceFile) });
    }
  } else {
    await updateIngestionJobStatus(jobId, { status: "pass1_ocr", currentStage: "layout_analysis" });
  }

  // ── Per-page stages ───────────────────────────────────────────────────────
  const confidences: number[] = [];
  let processedPages = 0;

  for (let i = 0; i < pageFiles.length; i++) {
    const pageNum = pageOffset + i + 1;
    const pageId = pageIds[i];
    const pagePath = pageFiles[i];

    await updateIngestionJobStatus(jobId, { currentStage: "layout_analysis", processedPages });

    const imgPart = await imageContent(pagePath);
    const pageContent: UserContentPart[] = [imgPart, { type: "text", text: "Analyze this page." }];

    // layout_analysis
    try {
      const r = await invokeStage("layout_analysis", pageContent);
      const data = parseJsonResponse(r.content);
      await updateDocumentPage(pageId, { layoutType: (data.layout_type as string) || undefined });
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} layout_analysis: ${err.message}`);
    }

    // bbox_detection
    let regions: any[] = [];
    try {
      await updateIngestionJobStatus(jobId, { currentStage: "bbox_detection" });
      const r = await invokeStage("bbox_detection", pageContent);
      const data = parseJsonResponse(r.content);
      regions = Array.isArray(data.regions) ? data.regions : [];
      await updateDocumentPage(pageId, { contentRegions: regions });
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} bbox_detection: ${err.message}`);
    }

    // ocr_extraction
    let ocrConfidence = 0;
    let ocrResultId: number | null = null;
    try {
      await updateIngestionJobStatus(jobId, { currentStage: "ocr_extraction" });
      const regionContext = regions.length > 0
        ? `Content regions: ${JSON.stringify(regions.slice(0, 5))}`
        : undefined;
      const r = await invokeStage("ocr_extraction", pageContent, regionContext);
      const data = parseJsonResponse(r.content);
      ocrConfidence = typeof data.confidence === "number" ? data.confidence : 0;

      const ocrResult = await createOcrResult({
        pageId,
        structuredData: data,
        rawText: JSON.stringify(data.content_blocks ?? data),
        confidence: ocrConfidence,
        status: "pass1_complete",
        pass1Model: r.model,
        auditLog: [{ timestamp: new Date().toISOString(), action: "pass1", model: r.model }],
      });
      ocrResultId = ocrResult.id;

      await updateDocumentPage(pageId, { ocrCompleted: true, ocrConfidence });
    } catch (err: any) {
      console.warn(`[Pipeline] Job ${jobId} p${pageNum} ocr_extraction: ${err.message}`);
      const ocrResult = await createOcrResult({ pageId, status: "failed", confidence: 0 });
      ocrResultId = ocrResult.id;
    }

    // Queue every page for HITL review
    await createHitlItem({
      pageId,
      ocrResultId: ocrResultId ?? undefined,
      reason: `Page ${pageNum} of ${totalDocPages} — initial HITL review`,
      flagCategory: "manual_flag",
      priority: "medium",
    });

    confidences.push(ocrConfidence);
    processedPages++;

    const avgConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
    await updateIngestionJobStatus(jobId, { processedPages, avgConfidence });
    console.log(`[Pipeline] Job ${jobId}: page ${pageNum}/${totalDocPages} (confidence: ${ocrConfidence})`);
  }

  // ── Finalize this block ───────────────────────────────────────────────────
  const avgConfidence = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
    : 0;

  await updateDocument(documentId, {
    processedPages,
    avgConfidence,
    totalPages: pageFiles.length,
    status: "hitl_required",
  });

  const nextOffset = pageOffset + pageFiles.length;
  const hasMore = nextOffset < totalDocPages;

  await updateIngestionJobStatus(jobId, {
    status: "review",
    processedPages,
    avgConfidence,
    completedAt: new Date(),
  });

  console.log(`[Pipeline] Job ${jobId}: ${processedPages} pages queued for HITL (avg confidence: ${avgConfidence})`);

  // ── Auto-chain next block ─────────────────────────────────────────────────
  // Re-fetch the job to check whether a cancel was requested while this block ran
  const currentJob = await getIngestionJobById(jobId);
  const wasCancelled = currentJob?.status === "failed" && currentJob?.errorMessage === "Cancelled by user";

  if (hasMore && !wasCancelled) {
    console.log(`[Pipeline] Job ${jobId}: chaining next block starting at page ${nextOffset + 1}`);
    const nextJobId = await createIngestionJob({
      sourceFile: job.sourceFile,
      storageProvider: (job as any).storageProvider ?? "local",
      driveFileId: (job as any).driveFileId ?? null,
      gameSystem: job.gameSystem ?? null,
      pageOffset: nextOffset,
      blockSize,
      status: "queued",
    } as any);
    startJob(nextJobId);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function countPdfPages(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 30_000 });
    const match = stdout.match(/^Pages:\s*(\d+)/m);
    return match ? parseInt(match[1], 10) : Infinity;
  } catch {
    return Infinity; // unknown — treat as unlimited
  }
}

async function convertToPages(
  sourceFile: string,
  pagesDir: string,
  firstPage: number,
  lastPage: number,
): Promise<string[]> {
  if (/\.(png|jpe?g|webp|tiff?)$/i.test(sourceFile)) {
    return [sourceFile];
  }
  if (/\.pdf$/i.test(sourceFile)) {
    const outputPrefix = join(pagesDir, "page");
    await execFileAsync(
      "pdftoppm",
      ["-png", "-r", "96", "-f", String(firstPage), "-l", String(lastPage), sourceFile, outputPrefix],
      { timeout: 180_000 },
    );
    const files = await readdir(pagesDir);
    return files
      .filter(f => f.endsWith(".png"))
      .sort()
      .map(f => join(pagesDir, f));
  }
  throw new Error(`Unsupported source format: ${sourceFile}. Expected .pdf or image file.`);
}

async function imageContent(filePath: string): Promise<{ type: "image_url"; image_url: { url: string } }> {
  const b64 = await readFile(filePath, "base64");
  return { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } };
}
