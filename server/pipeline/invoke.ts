import { getLlmProviderById, getStageInscriptionByStage, getSystemPromptByName, insertLlmTimingMetric } from "../db";
import { decryptSecret } from "../crypto";
import { fetchWithRetry, PER_ATTEMPT_TIMEOUT_MS } from "../_core/fetch-retry";

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
  /** Wall-clock milliseconds from request dispatch to valid response, including retries. */
  durationMs: number;
}

export interface InvokeContext {
  pageId?: number;
  jobId?: number;
}

export interface InvokeOptions {
  /** Pre-fill the assistant turn with "{" to force immediate JSON output. */
  prefillJson?: boolean;
  /** Few-shot examples inserted before the real user message. */
  fewShotExamples?: Array<{ user: string; assistant: string }>;
  /** Merged last, overriding inscription and provider settings. */
  overrideBody?: Record<string, unknown>;
  /** Optional semantic validation after a provider returns content. */
  validateResult?: (result: StageInvokeResult) => void;
}

type ProviderCandidate = {
  role: "primary" | "secondary" | "cloud_fallback";
  id: number;
  withRetry: boolean;
};

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
      headers.Authorization = `Bearer ${apiKey}`;
    } catch {
      throw new Error(`Failed to decrypt API key for provider ${provider.name}`);
    }
  }

  const body: Record<string, unknown> = {
    messages,
    temperature: inscription.temperature ?? provider.defaultTemperature ?? 0.2,
    max_tokens: inscription.maxTokens ?? 4096,
  };
  if (provider.modelId) body.model = provider.modelId;
  if (inscription.llmSettings) Object.assign(body, inscription.llmSettings);
  if (options?.overrideBody) Object.assign(body, options.overrideBody);

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
  const init = { method: "POST", headers, body: JSON.stringify(body) };

  const startMs = Date.now();
  const res = withRetry
    ? await fetchWithRetry(url, init)
    : await fetch(url, { ...init, signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS) });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`[${stage}] Provider ${provider.name} HTTP ${res.status}: ${errText.slice(0, 1000)}`);
  }

  const data = await res.json() as any;
  const durationMs = Date.now() - startMs;
  const rawContent = data.choices?.[0]?.message?.content ?? "";
  let content = typeof rawContent === "string"
    ? rawContent
    : (rawContent as any[])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");

  if (options?.prefillJson && !content.trimStart().startsWith("{")) {
    content = "{" + content;
  }

  return {
    content,
    model: data.model ?? provider.modelId ?? "",
    tokensUsed: data.usage?.total_tokens ?? 0,
    providerId: provider.id,
    durationMs,
  };
}

function logMetric(row: Parameters<typeof insertLlmTimingMetric>[0]): void {
  insertLlmTimingMetric(row).catch(err =>
    console.warn("[invoke] metric insert failed:", err?.message)
  );
}

function buildProviderOrder(inscription: any): ProviderCandidate[] {
  const candidates = [
    { role: "primary" as const, id: inscription.primaryProviderId, withRetry: true },
    { role: "secondary" as const, id: inscription.secondaryProviderId, withRetry: true },
    { role: "cloud_fallback" as const, id: inscription.fallbackProviderId, withRetry: false },
  ].filter((candidate): candidate is ProviderCandidate => typeof candidate.id === "number");

  const seen = new Set<number>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
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
  if (!inscription) throw new Error(`[CONFIG] No stage inscription configured for "${stage}". Add an inscription in Conclave -> Stage Inscriptions.`);
  if (!inscription.isActive) throw new Error(`Stage ${stage} inscription is inactive`);
  if (!inscription.primaryProviderId) throw new Error(`[CONFIG] No provider assigned to stage "${stage}". Assign a provider in Conclave -> Stage Inscriptions.`);

  let systemPrompt = "";
  if (inscription.promptName) {
    const prompt = await getSystemPromptByName(inscription.promptName);
    if (prompt?.promptText) systemPrompt = prompt.promptText;
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
      messages.push({ role: "user", content: ex.user });
      messages.push({ role: "assistant", content: ex.assistant });
    }
  }
  messages.push({ role: "user", content: userContent });
  if (options?.prefillJson) {
    messages.push({ role: "assistant", content: "{" });
  }

  const providerOrder = buildProviderOrder(inscription);
  const failures: string[] = [];
  for (const candidate of providerOrder) {
    const provider = await getLlmProviderById(candidate.id);
    if (!provider) {
      failures.push(`${candidate.role}: provider ${candidate.id} not found`);
      continue;
    }

    try {
      const result = await dispatchToProvider(stage, provider, messages, inscription, options, candidate.withRetry);
      options?.validateResult?.(result);
      if (candidate.role !== "primary") {
        console.log(`[invoke] ${stage} ${candidate.role} provider succeeded (model: ${result.model})`);
      }
      logMetric({
        jobId: context?.jobId,
        pageId: context?.pageId,
        stage,
        providerId: provider.id,
        providerName: provider.displayName ?? provider.name,
        model: result.model,
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed,
        isFallback: candidate.role !== "primary",
        success: true,
      });
      return result;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      failures.push(`${candidate.role}: ${msg.slice(0, 240)}`);
      if (candidate !== providerOrder[providerOrder.length - 1]) {
        console.warn(`[invoke] ${stage} ${candidate.role} provider failed (${msg.slice(0, 120)}), trying next provider.`);
      }
    }
  }

  throw new Error(`[${stage}] All configured providers failed. ${failures.join(" | ")}`);
}

export function parseJsonResponse(content: string): Record<string, unknown> {
  const cleaned = content
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  try { return JSON.parse(cleaned); } catch {}

  const start = cleaned.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    let lastDepth1Close = -1;

    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === "\"") { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        if (--depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch {}
          break;
        }
        if (depth === 1) lastDepth1Close = i;
      }
    }

    if (lastDepth1Close > start) {
      const suffixes = ["]}", "], \"page_summary\": \"(truncated)\"}"];
      for (const suffix of suffixes) {
        try { return JSON.parse(cleaned.slice(start, lastDepth1Close + 1) + suffix); } catch {}
      }
    }

    const closers = ["}", "}}", "}]}", "}]}\"}"];
    for (let trim = 0; trim < Math.min(200, cleaned.length - start); trim++) {
      const candidate = cleaned.slice(start, cleaned.length - trim);
      for (const closer of closers) {
        try { return JSON.parse(candidate + closer); } catch {}
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${cleaned.slice(0, 200)}`);
}
