import { chatResultFromJSON } from "@openrouter/sdk/models";
import {
  OpenRouterChatError,
  type OpenRouterNonStreamingChatRequest,
  type sendOpenRouterChat,
} from "@/lib/openrouter/sdk-chat";
import { resolveOpenAiModel } from "./model";

export function buildOpenAiChatRequest(request: OpenRouterNonStreamingChatRequest) {
  let model: string;
  try {
    model = resolveOpenAiModel(request.model ?? "");
  } catch {
    throw new OpenRouterChatError("missing_configuration");
  }
  // The application uses text only. Keep an explicit allowlist so router
  // preferences, tools, metadata and future SDK fields never leak into OpenAI.
  const messages = request.messages.map((message) => {
    if (!["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw new OpenRouterChatError("invalid_provider_response");
    }
    return { role: message.role, content: message.content };
  });
  const format = request.responseFormat;
  const effort = request.reasoning?.effort;
  // Luna's native API has none/low/medium/high/xhigh/max, not OpenRouter's
  // normalized minimal. Use the lowest reasoning level for classifiers.
  const reasoningEffort = effort === "minimal" && /^gpt-5\.6-luna(?:$|-)/i.test(model) ? "low" : effort;
  return {
    model,
    messages,
    stream: false,
    store: false,
    max_completion_tokens:
      effort === "minimal" && reasoningEffort === "low"
        ? Math.max(1_024, request.maxCompletionTokens ?? request.maxTokens ?? 0)
        : (request.maxCompletionTokens ?? request.maxTokens),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(format?.type === "json_schema"
      ? { response_format: { type: "json_schema", json_schema: format.jsonSchema } }
      : {}),
  };
}

export async function sendOpenAiChat({
  apiKey,
  chatRequest,
  fetcher = globalThis.fetch.bind(globalThis),
  timeoutMs = 12_000,
}: Parameters<typeof sendOpenRouterChat>[0]) {
  const key = apiKey?.trim();
  if (!key || key.startsWith("sk-or-")) throw new OpenRouterChatError("missing_configuration");
  const body = buildOpenAiChatRequest(chatRequest);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetcher(
      new Request("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
        // workerd only supports follow/manual. Reject 3xx below without
        // forwarding credentials or conversation content to a redirect target.
        redirect: "manual",
      }),
    );
    if (!response.ok) {
      // Never retain, log or expose the upstream error body.
      await response.body?.cancel();
      throw new OpenRouterChatError(
        response.status === 429
          ? "provider_rate_limited"
          : response.status === 408 || response.status === 504
            ? "provider_timeout"
            : response.status === 400 || response.status === 422
              ? "invalid_provider_response"
              : "provider_unavailable",
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OpenRouterChatError(controller.signal.aborted ? "provider_timeout" : "invalid_provider_response");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || "error" in payload) {
      throw new OpenRouterChatError("invalid_provider_response");
    }
    // Reuse the validated internal response contract, without invoking the
    // router. OpenAI can omit the deprecated system_fingerprint field.
    const parsed = chatResultFromJSON(JSON.stringify({ system_fingerprint: null, ...payload }));
    if (
      !parsed.ok ||
      parsed.value.choices.length === 0 ||
      parsed.value.choices.some(
        (choice) =>
          choice.finishReason !== "stop" ||
          typeof choice.message.content !== "string" ||
          !choice.message.content.trim(),
      )
    )
      throw new OpenRouterChatError("invalid_provider_response");
    return parsed.value;
  } catch (error) {
    if (error instanceof OpenRouterChatError) throw error;
    throw new OpenRouterChatError(controller.signal.aborted ? "provider_timeout" : "provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
