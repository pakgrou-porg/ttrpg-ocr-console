import { getLlmProviderById, getStageInscriptionByStage, getSystemPromptByName, insertLlmTimingMetric } from "../db";
import { decryptSecret } from "../crypto";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      const errText = await res.text().catch(() => "");
      lastError = new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      console.warn(`[invoke] attempt ${attempt + 1} got ${res.status}, retrying…`);
    } catch (err: any) {
      if (err?.name === "AbortError") throw err; // don't retry timeouts
      lastError = err;
      console.warn(`[invoke] attempt ${attempt + 1} network error: ${err?.message}`);
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

export interface StageContent {
  type: "text";
  text: string;
}

export interface StageImageContent {
  type: "image_url";
  image_url: { url: string };
}

export type UserContentPart = StageContent | StageImageContent;

export interface StageInvokeResult {
  content: string;
  model: string;
  tokensUsed: number;
  providerId: number;
  /** Wall-clock milliseconds from request dispatch to valid response (includes retries). */
  durationMs: number;
}

/** Optional per-call context for metric logging (pageId / jobId). */
export interface InvokeContext {
  pageId?: number;
  jobId?: number;
}

export interface InvokeOptions {
  /** Pre-fill the assistant turn with "{" to force immediate JSON output */
  prefillJson?: boolean;
  /** Few-shot examples inserted before the real user message */
  fewShotExamples?: Array<{ user: string; assistant: string }>;
  /** Merged last (overrides inscription + provider settings) */
  overrideBody?: Record<string, unknown>;
}

async function buildProviderCall(
  provider: any,
  messages: any[],
  inscription: { temperature?: number | null; maxTokens?: number | null; llmSettings?: unknown },
  options?: InvokeOptions,
): Promise<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> {
  const host = provider.baseUrl.replace(/\/$/, "");
  const portStr = provider.port ? `:${provider.port}` : "";
  const prefix = (provider.apiPrefix ?? "/v1").replace(/\/$/, "");
  const url = `${host}${portStr}${prefix}/chat/completions`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider.encryptedApiKey) {
    try {
      const apiKey = decryptSecret({
        ciphertext: provider.encryptedApiKey,
        iv: provider.keyIv ?? "",
        authTag: provider.keyAuthTag ?? "",
      });
      headers["Authorization"] = `Bearer ${apiKey}`;
    } catch {
      throw new Error(`Failed to decrypt API key for provider ${provider.name}`);
    }
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: inscription.temperature ?? provider.defaultTemperature ?? 0.2,
    max_tokens: inscription.maxTokens ?? 4096,
  };
  if (provider.defaultModelId) body.model = provider.defaultModelId;
  if (inscription.llmSettings) Object.assign(body, inscription.llmSettings);
  if (options?.overrideBody)   Object.assign(body, options.overrideBody);

  return { url, headers, body };
}

async function dispatchToProvider(
  stage: string,
  provider: any,
  messages: any[],
  inscription: { temperature?: number | null; maxTokens?: number | null; llmSettings?: unknown },
  options?: InvokeOptions,
  withRetry = true,
): Promise<StageInvokeResult> {
  const { url, headers, body } = await buildProviderCall(provider, messages, inscription, options);
  const fetchFn = withRetry ? fetchWithRetry : fetch;

  const startMs = Date.now();
  const res = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[${stage}] Provider ${provider.name} HTTP ${res.status}: ${errText.slice(0, 1000)}`);
  }

  const data = await res.json() as any;
  const durationMs = Date.now() - startMs;

  const rawContent = data.choices?.[0]?.message?.content ?? "";
  let content = typeof rawContent === "string"
    ? rawContent
    : (rawContent as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join("");

  if (options?.prefillJson && !content.trimStart().startsWith("{")) {
    content = "{" + content;
  }

  return {
    content,
    model: data.model ?? provider.defaultModelId ?? "",
    tokensUsed: data.usage?.total_tokens ?? 0,
    providerId: provider.id,
    durationMs,
  };
}

/** Fire-and-forget metric insert — never throws, never blocks the caller. */
function logMetric(row: Parameters<typeof insertLlmTimingMetric>[0]): void {
  insertLlmTimingMetric(row).catch(err =>
    console.warn("[invoke] metric insert failed:", err?.message)
  );
}

export async function invokeStage(
  stage: string,
  userContent: UserContentPart[],
  extraSystemContext?: string,
  fallbackSystemPrompt?: string,
  options?: InvokeOptions,
  context?: InvokeContext,
): Promise<StageInvokeResult> {
  const inscription = await getStageInscriptionByStage(stage);
  if (!inscription) throw new Error(`[CONFIG] No stage inscription configured for "${stage}". Add an inscription in Conclave → Stage Inscriptions.`);
  if (!inscription.isActive) throw new Error(`Stage ${stage} inscription is inactive`);

  const providerId = inscription.primaryProviderId;
  if (!providerId) throw new Error(`[CONFIG] No provider assigned to stage "${stage}". Assign a provider in Conclave → Stage Inscriptions.`);

  const primary = await getLlmProviderById(providerId);
  if (!primary) throw new Error(`Provider ${providerId} not found`);

  let systemPrompt = "";
  if (inscription.promptName) {
    const prompt = await getSystemPromptByName(inscription.promptName);
    if (prompt?.content) systemPrompt = prompt.content;
  }
  if (!systemPrompt && fallbackSystemPrompt) {
    systemPrompt = fallbackSystemPrompt;
  }
  if (extraSystemContext) {
    systemPrompt = systemPrompt ? `${systemPrompt}\n\n${extraSystemContext}` : extraSystemContext;
  }

  const messages: any[] = [];
  if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt });
  if (options?.fewShotExamples) {
    for (const ex of options.fewShotExamples) {
      messages.push({ role: "user",      content: ex.user });
      messages.push({ role: "assistant", content: ex.assistant });
    }
  }
  messages.push({ role: "user", content: userContent });
  if (options?.prefillJson) {
    messages.push({ role: "assistant", content: "{" });
  }

  // ── Primary attempt (with full retry loop) ───────────────────────────────
  try {
    const result = await dispatchToProvider(stage, primary, messages, inscription, options, true);
    logMetric({
      jobId: context?.jobId, pageId: context?.pageId,
      stage, providerId: primary.id, providerName: primary.displayName ?? primary.name,
      model: result.model, durationMs: result.durationMs,
      tokensUsed: result.tokensUsed, isFallback: false, success: true,
    });
    return result;
  } catch (primaryErr: any) {
    const fallbackProviderId = (inscription as any).fallbackProviderId as number | null | undefined;
    if (!fallbackProviderId) throw primaryErr; // no fallback configured — propagate original error

    console.warn(`[invoke] ${stage} primary provider failed (${primaryErr?.message?.slice(0, 120)}), trying fallback provider…`);

    const fallback = await getLlmProviderById(fallbackProviderId);
    if (!fallback) throw primaryErr; // fallback provider record missing — propagate original error

    // ── Fallback attempt (single shot, no retry loop) ────────────────────
    // Strip response_format — not all models support json_object mode
    const fallbackOptions: InvokeOptions | undefined = options?.overrideBody
      ? { ...options, overrideBody: { ...options.overrideBody, response_format: undefined } }
      : options;
    try {
      const result = await dispatchToProvider(stage, fallback, messages, inscription, fallbackOptions, false);
      console.log(`[invoke] ${stage} fallback provider succeeded (model: ${result.model})`);
      logMetric({
        jobId: context?.jobId, pageId: context?.pageId,
        stage, providerId: fallback.id, providerName: fallback.displayName ?? fallback.name,
        model: result.model, durationMs: result.durationMs,
        tokensUsed: result.tokensUsed, isFallback: true, success: true,
      });
      return result;
    } catch (fallbackErr: any) {
      // Both failed — throw a combined error so the caller sees the full picture
      throw new Error(
        `[${stage}] Both providers failed. Primary: ${primaryErr?.message?.slice(0, 200)}. Fallback: ${fallbackErr?.message?.slice(0, 200)}`
      );
    }
  }
}

export function parseJsonResponse(content: string): Record<string, unknown> {
  const cleaned = content
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // Fast path: the whole string is valid JSON
  try { return JSON.parse(cleaned); } catch {}

  // Brace-count to find the first complete JSON object, ignoring trailing text
  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    // Track the position of the last '},\n' or '},' at depth==1 so we can
    // recover when the response is truncated mid-array (max_tokens hit).
    let lastDepth1Close = -1;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc)              { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true;  continue; }
      if (ch === '"')       { inStr = !inStr; continue; }
      if (inStr)            continue;
      if (ch === "{")       depth++;
      if (ch === "}") {
        if (--depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch {}
          break;
        }
        // Remember last safe close-of-array-item position (depth back to 1)
        if (depth === 1) lastDepth1Close = i;
      }
    }

    // ── Truncation recovery ──────────────────────────────────────────────────
    // The response was cut off before JSON was complete (max_tokens hit).
    // Try to close the structure at the last known-safe point so we can
    // salvage whatever content blocks were fully generated.

    // Strategy 1: close at the last depth-1 item boundary
    if (lastDepth1Close > start) {
      const suffixes = ["]}", "], \"page_summary\": \"(truncated)\"}"];
      for (const suffix of suffixes) {
        try { return JSON.parse(cleaned.slice(start, lastDepth1Close + 1) + suffix); } catch {}
      }
    }

    // Strategy 2: brute-force trim from the end — try progressively shorter
    // slices and see if appending closing chars makes it valid JSON
    const closers = ["}", "}}", "}]}", "}]}\"}"];
    for (let trim = 0; trim < Math.min(200, cleaned.length - start); trim++) {
      const candidate = cleaned.slice(start, cleaned.length - trim);
      for (const c of closers) {
        try { return JSON.parse(candidate + c); } catch {}
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${cleaned.slice(0, 200)}`);
}
