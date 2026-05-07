import { getLlmProviderById, getStageInscriptionByStage, getSystemPromptByName } from "../db";
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
}

export async function invokeStage(
  stage: string,
  userContent: UserContentPart[],
  extraSystemContext?: string,
  fallbackSystemPrompt?: string,
): Promise<StageInvokeResult> {
  const inscription = await getStageInscriptionByStage(stage);
  if (!inscription) throw new Error(`[CONFIG] No stage inscription configured for "${stage}". Add an inscription in Conclave → Stage Inscriptions.`);
  if (!inscription.isActive) throw new Error(`Stage ${stage} inscription is inactive`);

  const providerId = inscription.primaryProviderId;
  if (!providerId) throw new Error(`[CONFIG] No provider assigned to stage "${stage}". Assign a provider in Conclave → Stage Inscriptions.`);

  const provider = await getLlmProviderById(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);

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

  const messages: any[] = [];
  if (systemPrompt.trim()) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userContent });

  const body: Record<string, unknown> = {
    messages,
    temperature: inscription.temperature ?? provider.defaultTemperature ?? 0.2,
    max_tokens: inscription.maxTokens ?? 4096,
  };
  if (provider.defaultModelId) body.model = provider.defaultModelId;
  if (inscription.llmSettings) Object.assign(body, inscription.llmSettings);

  const res = await fetchWithRetry(url, {
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
  const rawContent = data.choices?.[0]?.message?.content ?? "";
  const content = typeof rawContent === "string"
    ? rawContent
    : (rawContent as any[]).filter((p: any) => p.type === "text").map((p: any) => p.text).join("");

  return {
    content,
    model: data.model ?? provider.defaultModelId ?? "",
    tokensUsed: data.usage?.total_tokens ?? 0,
    providerId,
  };
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
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc)              { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true;  continue; }
      if (ch === '"')       { inStr = !inStr; continue; }
      if (inStr)            continue;
      if (ch === "{")       depth++;
      if (ch === "}" && --depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch {}
        break;
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${cleaned.slice(0, 200)}`);
}
