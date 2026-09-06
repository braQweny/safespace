import type { ChatResult } from "@openrouter/sdk/models";
import { SessionSummaryError } from "./errors";
import type { SessionSummaryFinishReason, SessionSummaryProviderMetadata, SessionSummaryTokenUsage } from "./types";

// Wspólne dla podsumowań i kart osób; bez importu środowiska, żeby parsery
// dało się testować bez `astro:env/server`.

/** `length`, `content_filter` i `tool_calls` to odpowiedzi niepełne — odrzucamy, nigdy nie przycinamy. */
export function assertCompleteSummaryResponse(responseBody: ChatResult) {
  const finishReason = parseFinishReason(responseBody);

  if (finishReason === "length" || finishReason === "content_filter" || finishReason === "tool_calls") {
    throw new SessionSummaryError("invalid_provider_response");
  }
}

export function buildSummaryProviderMetadata(
  responseBody: ChatResult,
  fallbackModel: string,
): SessionSummaryProviderMetadata {
  const finishReason = parseFinishReason(responseBody);
  const usage = parseUsage(responseBody);

  return {
    provider: "openrouter",
    model: parseResponseModel(responseBody) ?? fallbackModel,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

export function extractFirstChoice(responseBody: ChatResult) {
  const { choices } = responseBody;

  if (choices.length === 0) {
    throw new SessionSummaryError("invalid_provider_response");
  }

  return choices[0];
}

function parseResponseModel(responseBody: ChatResult) {
  const model = responseBody.model.trim();

  return model.length > 0 ? model : undefined;
}

function parseFinishReason(responseBody: ChatResult): SessionSummaryFinishReason | undefined {
  const choice = extractFirstChoice(responseBody);
  // The SDK types finishReason as a branded Unrecognized<string> union that
  // equality checks cannot narrow; widen to plain string first.
  const finishReason = choice.finishReason as string | undefined;

  if (finishReason === "stop" || finishReason === "length" || finishReason === "content_filter") {
    return finishReason;
  }

  if (finishReason === "tool_calls") {
    return finishReason;
  }

  return typeof finishReason === "string" && finishReason.trim().length > 0 ? "unknown" : undefined;
}

function parseUsage(responseBody: ChatResult): SessionSummaryTokenUsage | undefined {
  if (!responseBody.usage) {
    return undefined;
  }

  const usage = {
    ...parseTokenCount(responseBody.usage.promptTokens, "promptTokens"),
    ...parseTokenCount(responseBody.usage.completionTokens, "completionTokens"),
    ...parseTokenCount(responseBody.usage.totalTokens, "totalTokens"),
  };

  return Object.keys(usage).length > 0 ? usage : undefined;
}

function parseTokenCount<K extends keyof SessionSummaryTokenUsage>(
  value: unknown,
  key: K,
): Pick<SessionSummaryTokenUsage, K> | Record<string, never> {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {};
  }

  return {
    [key]: Math.round(value),
  } as Pick<SessionSummaryTokenUsage, K>;
}
