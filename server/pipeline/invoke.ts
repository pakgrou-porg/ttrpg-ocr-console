import { getLlmProviderById, getStageInscriptionByStage, getSystemPromptByName } from "../db";
import { decryptSecret } from "../crypto";

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
): Promise<StageInvokeResult> {
  const inscription = await getStageInscriptionByStage(stage);
  if (!inscription) throw new Error(`No inscription configured for stage: ${stage}`);
  if (!inscription.isActive) throw new Error(`Stage ${stage} inscription is inactive`);

  const providerId = inscription.primaryProviderId;
  if (!providerId) throw new Error(`No provider assigned to stage: ${stage}`);

  const provider = await getLlmProviderById(providerId);
  if (!provider) throw new Error(`Provider ${providerId} not found`);

  let systemPrompt = "";
  if (inscription.promptName) {
    const prompt = await getSystemPromptByName(inscription.promptName);
    if (prompt?.content) systemPrompt = prompt.content;
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
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: userContent });

  const body: Record<string, unknown> = {
    messages,
    temperature: inscription.temperature ?? provider.defaultTemperature ?? 0.2,
    max_tokens: inscription.maxTokens ?? provider.maxTokens ?? 4096,
  };
  if (provider.defaultModelId) body.model = provider.defaultModelId;
  if (inscription.llmSettings) Object.assign(body, inscription.llmSettings);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Provider ${provider.name} HTTP ${res.status}: ${errText.slice(0, 300)}`);
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
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Could not parse JSON from LLM response: ${cleaned.slice(0, 200)}`);
  }
}
