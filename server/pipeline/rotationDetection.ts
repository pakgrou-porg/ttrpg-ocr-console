/**
 * Page Rotation Detection and Correction
 *
 * Detects page rotation using two methods, in priority order:
 *
 *   1. Tesseract OSD  (`tesseract <img> stdout --psm 0`)
 *      Reports `Rotate: N` (0/90/180/270) and an orientation confidence score.
 *      Auto-corrects when confidence ≥ OSD_CONFIDENCE_THRESHOLD (default 2.0).
 *      Handles all four right-angle rotations including 180° (upside-down).
 *
 *   2. Aspect-ratio heuristic  (sharp metadata, no extra deps)
 *      Compares each page's width/height ratio against the batch majority.
 *      Detects 90°/270° rotations (landscape page in a portrait-majority batch).
 *      Cannot determine direction without content analysis, so it flags the page
 *      (detectedRotation = 90) but does NOT auto-correct — the reviewer is shown
 *      a manual rotation control in the HITL UI.
 *
 * Correction is done in-place: the raw PNG file is overwritten with the rotated
 * version so all downstream stages (preprocessing, layout, OCR) see the upright
 * image without any extra plumbing.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile } from "fs/promises";

const execFileAsync = promisify(execFile);

// ─── Types ────────────────────────────────────────────────────────────────────

export type RotationDegrees = 0 | 90 | 180 | 270;

export interface RotationDetectionResult {
  /** Detected rotation in degrees (0 = upright, 90/180/270 = needs correction). */
  degrees: RotationDegrees;
  /** Confidence score: Tesseract reports 0–10+; aspect-ratio gives 1.0–1.5; none = 0. */
  confidence: number;
  /** Which method produced the result. */
  method: "tesseract_osd" | "aspect_ratio" | "none";
  /** Whether the image file was actually corrected (rotated and overwritten). */
  corrected: boolean;
  /** Updated width after rotation (only set when corrected = true). */
  newWidth?: number;
  /** Updated height after rotation (only set when corrected = true). */
  newHeight?: number;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

/**
 * Minimum Tesseract OSD orientation confidence to trigger auto-correction.
 * Tesseract returns values roughly in the range 0–15; scores below 2 are
 * unreliable on pages with sparse text or unusual layouts.
 */
const OSD_CONFIDENCE_THRESHOLD = 2.0;

// ─── Sharp (lazy singleton) ───────────────────────────────────────────────────

let _sharpFn: ((input: string | Buffer) => any) | null | undefined;
async function loadSharp(): Promise<((input: string | Buffer) => any) | null> {
  if (_sharpFn !== undefined) return _sharpFn;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — sharp types not installed; run: pnpm add sharp
    const mod = await import("sharp");
    _sharpFn = (mod.default ?? mod) as (input: string | Buffer) => any;
  } catch {
    _sharpFn = null;
  }
  return _sharpFn;
}

// ─── Tesseract OSD ────────────────────────────────────────────────────────────

/**
 * Run Tesseract in OSD-only mode (`--psm 0`) on a single image file.
 *
 * Tries two invocations:
 *   1. With `-l osd`  — works on systems where the OSD language pack is installed
 *      as a separate data file (older Tesseract packages).
 *   2. Without `-l`   — newer Tesseract has OSD built-in; the flag is redundant
 *      but harmless if the osd data file is also present.
 *
 * OSD output (stdout or stderr depending on tesseract version):
 *   ```
 *   Orientation in degrees: 90
 *   Rotate: 270
 *   Orientation confidence: 10.28
 *   Script: Latin
 *   Script confidence: 5.02
 *   ```
 *
 * `Rotate` is the correction to apply: rotate the image that many degrees
 * clockwise to make the text upright.  We pass this directly to sharp.rotate().
 *
 * Returns null when tesseract is not installed or when OSD detection fails
 * (e.g. no text found on a blank/illustration-only page).
 */
async function runTesseractOSD(
  imagePath: string,
): Promise<{ rotate: RotationDegrees; confidence: number } | null> {
  const invocations = [
    ["tesseract", imagePath, "stdout", "--psm", "0", "-l", "osd"],
    ["tesseract", imagePath, "stdout", "--psm", "0"],
  ] as const;

  for (const [cmd, ...args] of invocations) {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 30_000 });
      const combined = stdout + "\n" + stderr;

      // "Rotate: 270"  — the correction angle
      const rotateMatch = combined.match(/Rotate:\s*(\d+)/);
      if (!rotateMatch) continue;

      const confMatch = combined.match(/Orientation confidence:\s*([\d.]+)/);
      const rawRotate = parseInt(rotateMatch[1], 10) % 360;
      const rotate = [0, 90, 180, 270].includes(rawRotate)
        ? (rawRotate as RotationDegrees)
        : 0;
      const confidence = confMatch ? parseFloat(confMatch[1]) : 0;

      return { rotate, confidence };
    } catch {
      // Try next invocation, or return null if both fail
    }
  }
  return null;
}

// ─── Aspect-ratio heuristic ───────────────────────────────────────────────────

/**
 * Determine whether the document's pages are predominantly portrait or landscape
 * by reading image metadata for a sample of paths.
 *
 * @returns true  if ≥ 60% of sampled pages are portrait (height ≥ width)
 *          false if ≥ 60% are landscape
 *          true  (portrait assumed) if sharp is unavailable or sample is empty
 */
export async function detectDocumentMajorityIsPortrait(
  imagePaths: string[],
): Promise<boolean> {
  const sharp = await loadSharp();
  if (!sharp || imagePaths.length === 0) return true;

  // Sample up to 20 pages spread across the batch for efficiency
  const stride = Math.max(1, Math.floor(imagePaths.length / 20));
  const sample = imagePaths.filter((_, i) => i % stride === 0).slice(0, 20);

  let portrait = 0;
  let landscape = 0;
  await Promise.all(
    sample.map(async p => {
      try {
        const meta = await sharp(p).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        if (!w || !h) return;
        if (h >= w) portrait++;
        else landscape++;
      } catch { /* ignore unreadable files */ }
    }),
  );

  const total = portrait + landscape;
  if (total === 0) return true;
  return portrait / total >= 0.6;
}

// ─── Correction via sharp ─────────────────────────────────────────────────────

/**
 * Rotate the image at `imagePath` by `degrees` degrees clockwise, overwriting
 * the file in place.  White is used as the background fill for any uncovered
 * corners (though for right-angle rotations there are no uncovered corners).
 *
 * Exported so the HITL router can apply manually-requested rotations.
 *
 * @returns the new width and height of the corrected image
 */
export async function applyRotationInPlace(
  imagePath: string,
  degrees: RotationDegrees,
): Promise<{ newWidth: number; newHeight: number }> {
  const sharp = await loadSharp();
  if (!sharp) throw new Error("[RotationDetect] Sharp not available — run: pnpm add sharp");

  const buffer = await sharp(imagePath)
    .rotate(degrees, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  await writeFile(imagePath, buffer);

  const meta = await sharp(buffer).metadata();
  return { newWidth: meta.width ?? 0, newHeight: meta.height ?? 0 };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Detect and (when confident enough) correct the rotation of a single page image.
 *
 * Call this for every page after PDF→PNG conversion and before any other pipeline
 * stage, so that layout analysis, OCR, and content assembly all see upright pages.
 *
 * @param imagePath              Filesystem path to the raw PNG.
 * @param majorityIsPortrait     Document-level orientation majority (from
 *                               detectDocumentMajorityIsPortrait).  Used only
 *                               when Tesseract OSD is unavailable.
 */
export async function detectAndCorrectPageRotation(
  imagePath: string,
  majorityIsPortrait = true,
): Promise<RotationDetectionResult> {
  // ── Method 1: Tesseract OSD ───────────────────────────────────────────────
  const osd = await runTesseractOSD(imagePath);

  if (osd !== null) {
    if (osd.rotate === 0) {
      return { degrees: 0, confidence: osd.confidence, method: "tesseract_osd", corrected: false };
    }

    if (osd.confidence >= OSD_CONFIDENCE_THRESHOLD) {
      console.log(
        `[RotationDetect] ${imagePath}: rotate ${osd.rotate}° ` +
        `(OSD confidence ${osd.confidence.toFixed(1)} ≥ ${OSD_CONFIDENCE_THRESHOLD})`,
      );
      const { newWidth, newHeight } = await applyRotationInPlace(imagePath, osd.rotate);
      return {
        degrees: osd.rotate,
        confidence: osd.confidence,
        method: "tesseract_osd",
        corrected: true,
        newWidth,
        newHeight,
      };
    }

    // Detected but confidence too low — report without correcting
    console.log(
      `[RotationDetect] ${imagePath}: rotation ${osd.rotate}° suspected ` +
      `but confidence ${osd.confidence.toFixed(1)} < ${OSD_CONFIDENCE_THRESHOLD} — not auto-correcting`,
    );
    return { degrees: osd.rotate, confidence: osd.confidence, method: "tesseract_osd", corrected: false };
  }

  // ── Method 2: Aspect-ratio heuristic ─────────────────────────────────────
  const sharp = await loadSharp();
  if (sharp) {
    try {
      const meta = await sharp(imagePath).metadata();
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w > 0 && h > 0) {
        const ratio = w / h;
        const pageIsPortrait = ratio < 1.0;
        // Flag if orientation doesn't match majority by more than a 20% margin
        if (pageIsPortrait !== majorityIsPortrait && Math.abs(ratio - 1.0) > 0.2) {
          console.log(
            `[RotationDetect] ${imagePath}: aspect ratio ${ratio.toFixed(2)} ` +
            `differs from document majority (${majorityIsPortrait ? "portrait" : "landscape"}) ` +
            `— flagged as likely rotated (direction unknown, needs HITL review)`,
          );
          // Cannot determine 90° vs 270° without content analysis — flag only, no auto-correct
          return { degrees: 90, confidence: 1.0, method: "aspect_ratio", corrected: false };
        }
      }
    } catch { /* unreadable image — skip */ }
  }

  return { degrees: 0, confidence: 0, method: "none", corrected: false };
}
