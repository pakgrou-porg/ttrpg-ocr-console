import { getLlmProviderById, getStageInscriptionByStage, getSystemPromptByName, insertLlmTimingMetric, insertProviderExchangeLog, updateLlmProvider } from "../db";
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

function cleanModelId(modelId: unknown): string | undefined {
  if (typeof modelId !== "string") return undefined;
  const trimmed = modelId.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function providerBaseUrl(provider: any): string {
  const host = provider.baseUrl.replace(/\/$/, "");
  const portStr = provider.port ? `:${provider.port}` : "";
  const prefix = (provider.apiPrefix ?? "/v1").replace(/\/$/, "");
  return `${host}${portStr}${prefix}`;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (/^(127\.|10\.)/.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  return !!match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31;
}

function canDiscoverLoadedModel(provider: any): boolean {
  if (provider.providerType === "lm_studio" || provider.providerType === "custom") return true;
  if (provider.providerType !== "openai_compatible") return false;
  try {
    const url = new URL(provider.baseUrl);
    return isPrivateOrLocalHost(url.hostname);
  } catch {
    return false;
  }
}

async function discoverLoadedModels(provider: any, headers: Record<string, string>): Promise<string[]> {
  const res = await fetch(`${providerBaseUrl(provider)}/models`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = await res.json() as { data?: Array<{ id?: string }> };
  return (data.data ?? []).map(model => model.id).filter((id): id is string => !!id);
}

function isMissingModelResponse(status: number, body: string): boolean {
  return status === 404 && /model[\s\S]{0,160}(does not exist|not found)/i.test(body);
}

function isUnsupportedResponseFormat(status: number, body: string): boolean {
  return status === 400 && /response_format/i.test(body);
}

async function buildProviderCall(
  provider: any,
  messages: any[],
  inscription: { temperature?: number | null; maxTokens?: number | null; llmSettings?: unknown },
  options?: InvokeOptions,
): Promise<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> {
  const url = `${providerBaseUrl(provider)}/chat/completions`;

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
  const configuredModel = cleanModelId(provider.modelId);
  if (configuredModel) body.model = configuredModel;
  if (inscription.llmSettings) Object.assign(body, inscription.llmSettings);
  if (options?.overrideBody) Object.assign(body, options.overrideBody);
  const finalModel = cleanModelId(body.model);
  if (finalModel) body.model = finalModel;
  else delete body.model;

  return { url, headers, body };
}

async function dispatchToProvider(
  stage: string,
  provider: any,
  messages: any[],
  inscription: { temperature?: number | null; maxTokens?: number | null; llmSettings?: unknown },
  options?: InvokeOptions,
  withRetry = true,
  context?: InvokeContext,
): Promise<StageInvokeResult> {
  const { url, headers, body } = await buildProviderCall(provider, messages, inscription, options);

  const startMs = Date.now();
  const postChat = (requestBody: Record<string, unknown>) => {
    const init = { method: "POST", headers, body: JSON.stringify(requestBody) };
    return withRetry
      ? fetchWithRetry(url, init)
      : fetch(url, { ...init, signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS) });
  };

  let usedModel = typeof body.model === "string" ? body.model : undefined;
  const logFailure = (errorMessage: string) => {
    const { messages: _msgs, ...restBody } = body as any;
    logExchange({
      providerId: provider.id,
      providerName: provider.displayName ?? provider.name,
      stage,
      jobId: context?.jobId ?? null,
      pageId: context?.pageId ?? null,
      model: usedModel ?? cleanModelId(provider.modelId) ?? null,
      requestMessages: sanitizeMessagesForLog(messages),
      requestMeta: restBody as Record<string, unknown>,
      responseRaw: null,
      durationMs: Date.now() - startMs,
      tokensUsed: 0,
      success: false,
      errorMessage,
    });
  };

  let res = await postChat(body);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (isMissingModelResponse(res.status, errText) && canDiscoverLoadedModel(provider)) {
      const models = await discoverLoadedModels(provider, headers).catch(() => []);
      const fallbackModel = models.find(model => model === cleanModelId(provider.modelId)) ?? models[0];
      if (fallbackModel && fallbackModel !== usedModel) {
        console.warn(
          `[invoke] ${stage} provider ${provider.name} rejected model ${usedModel ?? "(none)"}; retrying loaded model ${fallbackModel}.`,
        );
        res = await postChat({ ...body, model: fallbackModel });
        usedModel = fallbackModel;
        if (res.ok) {
          updateLlmProvider(provider.id, { modelId: fallbackModel, availableModels: models } as any)
            .catch(err => console.warn(`[invoke] failed to persist discovered model for ${provider.name}: ${err?.message}`));
        }
      }
      if (!res.ok) {
        const retryText = await res.text().catch(() => "");
        const errMsg = `[${stage}] Provider ${provider.name} HTTP ${res.status}: ${retryText.slice(0, 1000)} (after model discovery: ${models.join(", ") || "none"})`;
        logFailure(errMsg);
        throw new Error(errMsg);
      }
    } else if (isUnsupportedResponseFormat(res.status, errText) && "response_format" in body) {
      // Provider rejected response_format (e.g. only accepts 'json_schema' or 'text', not 'json_object').
      // Retry without it — prefillJson + explicit user instruction still steers JSON output.
      console.warn(
        `[invoke] ${stage} provider ${provider.name} rejected response_format; retrying without it.`,
      );
      const { response_format: _rf, ...bodyWithout } = body as any;
      res = await postChat(bodyWithout);
      if (!res.ok) {
        const retryText = await res.text().catch(() => "");
        const errMsg = `[${stage}] Provider ${provider.name} HTTP ${res.status}: ${retryText.slice(0, 1000)} (after dropping response_format)`;
        logFailure(errMsg);
        throw new Error(errMsg);
      }
    } else {
      const errMsg = `[${stage}] Provider ${provider.name} HTTP ${res.status}: ${errText.slice(0, 1000)}`;
      logFailure(errMsg);
      throw new Error(errMsg);
    }
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

  const resolvedModel = data.model ?? usedModel ?? cleanModelId(provider.modelId) ?? "";
  const durationMsFinal = Date.now() - startMs;

  // Strip images and log the exchange to the ring buffer (fire-and-forget).
  const { messages: _msgs, ...restBody } = body as any;
  logExchange({
    providerId: provider.id,
    providerName: provider.displayName ?? provider.name,
    stage,
    jobId: context?.jobId ?? null,
    pageId: context?.pageId ?? null,
    model: resolvedModel,
    requestMessages: sanitizeMessagesForLog(messages),
    requestMeta: restBody as Record<string, unknown>,
    responseRaw: content,
    durationMs: durationMsFinal,
    tokensUsed: data.usage?.total_tokens ?? 0,
    success: true,
  });

  return {
    content,
    model: resolvedModel,
    tokensUsed: data.usage?.total_tokens ?? 0,
    providerId: provider.id,
    durationMs: durationMsFinal,
  };
}

function logMetric(row: Parameters<typeof insertLlmTimingMetric>[0]): void {
  insertLlmTimingMetric(row).catch(err =>
    console.warn("[invoke] metric insert failed:", err?.message)
  );
}

/**
 * Replace base64 image data in a messages array with a size placeholder so
 * the exchange log row stays a manageable size (typically a few KB vs. several MB).
 */
function sanitizeMessagesForLog(messages: any[]): any[] {
  return messages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    return {
      ...msg,
      content: msg.content.map((part: any) => {
        if (part.type !== "image_url") return part;
        const url: string = part.image_url?.url ?? "";
        const kb = Math.round(url.length * 0.75 / 1024);
        return { type: "image_url", image_url: { url: `[image omitted: ~${kb} kb]` } };
      }),
    };
  });
}

function logExchange(data: Parameters<typeof insertProviderExchangeLog>[0]): void {
  insertProviderExchangeLog(data).catch(err =>
    console.warn("[invoke] exchange log insert failed:", err?.message)
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
      const result = await dispatchToProvider(stage, provider, messages, inscription, options, candidate.withRetry, context);
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
