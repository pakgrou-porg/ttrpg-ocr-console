/**
 * Pipeline configuration loader.
 *
 * Reads /app/pipeline-config.yaml (or PIPELINE_CONFIG_PATH env var) at startup.
 * Falls back to built-in defaults when the file is absent or unparseable.
 * The parsed config is exported as a plain frozen object; restart required for
 * changes to take effect.
 *
 * Requires the `yaml` package: pnpm add yaml
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

// ─── Config shape ─────────────────────────────────────────────────────────────

export interface BinarizeConfig {
  enabled: boolean;
  grayscale: boolean;
  sharpenSigma: number;
  threshold: number;
  denoise: boolean;
}

export interface PipelineConfig {
  pipeline: {
    pdfDpi: number;
    hitlConfidenceThreshold: number;
    maxLlmConcurrency: number;
  };
  binarize: BinarizeConfig;
}

// ─── Defaults (used when config file is absent or a key is missing) ───────────

const DEFAULTS: PipelineConfig = {
  pipeline: {
    pdfDpi: 150,
    hitlConfidenceThreshold: 80,
    // One page in-flight at a time. Within each page, layout_analysis and
    // bbox_detection run concurrently (2 LLM calls), which already fills a
    // 2-slot local model. Raise to 2 for a 4-slot model.
    maxLlmConcurrency: 1,
  },
  binarize: {
    enabled: true,
    grayscale: true,
    sharpenSigma: 1.2,
    threshold: 0,
    denoise: false,
  },
};

// ─── Loader ───────────────────────────────────────────────────────────────────

function loadConfig(): PipelineConfig {
  const configPath = process.env.PIPELINE_CONFIG_PATH ?? "/app/pipeline-config.yaml";

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf8");
  } catch {
    // Config file not present — use defaults silently (common in dev)
    return DEFAULTS;
  }

  let parsed: Record<string, unknown>;
  try {
    // Use createRequire so we can synchronously require the yaml package
    // (yaml ships CJS + ESM; createRequire works for both)
    const _require = createRequire(import.meta.url);
    const { parse } = _require("yaml") as { parse: (s: string) => unknown };
    parsed = (parse(raw) as Record<string, unknown>) ?? {};
  } catch (err: any) {
    const hint = err.message?.includes("Cannot find module")
      ? " (run: pnpm add yaml)"
      : "";
    console.warn(`[Pipeline] Cannot load config from ${configPath}: ${err.message}${hint} — using defaults`);
    return DEFAULTS;
  }

  const pipeline = (parsed.pipeline ?? {}) as Record<string, unknown>;
  const binarize = (parsed.binarize ?? {}) as Record<string, unknown>;

  const config: PipelineConfig = {
    pipeline: {
      pdfDpi:                   num(pipeline.pdfDpi,                  DEFAULTS.pipeline.pdfDpi),
      hitlConfidenceThreshold:  num(pipeline.hitlConfidenceThreshold, DEFAULTS.pipeline.hitlConfidenceThreshold),
      maxLlmConcurrency:        num(pipeline.maxLlmConcurrency,       DEFAULTS.pipeline.maxLlmConcurrency),
    },
    binarize: {
      enabled:      bool(binarize.enabled,      DEFAULTS.binarize.enabled),
      grayscale:    bool(binarize.grayscale,     DEFAULTS.binarize.grayscale),
      sharpenSigma: num( binarize.sharpenSigma,  DEFAULTS.binarize.sharpenSigma),
      threshold:    num( binarize.threshold,      DEFAULTS.binarize.threshold),
      denoise:      bool(binarize.denoise,        DEFAULTS.binarize.denoise),
    },
  };

  console.log(`[Pipeline] Loaded config from ${configPath} (pdfDpi=${config.pipeline.pdfDpi}, binarize=${config.binarize.enabled})`);
  return config;
}

// ─── Type-safe coercions ──────────────────────────────────────────────────────

function num(val: unknown, fallback: number): number {
  return typeof val === "number" && isFinite(val) ? val : fallback;
}

function bool(val: unknown, fallback: boolean): boolean {
  return typeof val === "boolean" ? val : fallback;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const pipelineConfig: PipelineConfig = loadConfig();
