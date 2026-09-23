import { isRecord } from "@/lib/type-guards";
import type { AiProviderName } from "./types";

/**
 * Reading one Chat Completions reply, shared by every pipeline behind
 * `sendAiChat` (conversation, summaries, people/topics, safety, lenses).
 * Each throwing helper takes `fail`, which raises the pipeline's own error
 * class and category, so no parser learns another boundary's error type.
 *
 * The helpers accept `unknown`: both transports hand back the SDK's validated
 * `ChatResult` (camelCase), while parsers and tests may also see the raw wire
 * shape (`finish_reason`, `prompt_tokens`), so both spellings are read.
 */
export type ChatResponseFailure = () => never;

export type ChatFinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "unknown";

export interface ChatTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatProviderMetadata {
  provider: AiProviderName;
  model: string;
  finishReason?: ChatFinishReason;
  usage?: ChatTokenUsage;
}

// A truncated, filtered or tool-call reply is incomplete: rejected, never
// trimmed, never stored as if it were a whole answer.
const INCOMPLETE_FINISH_REASONS: ReadonlySet<unknown> = new Set(["length", "content_filter", "tool_calls"]);
const KNOWN_FINISH_REASONS: ReadonlySet<unknown> = new Set(["stop", "length", "content_filter", "tool_calls"]);

/**
 * The first choice's text, after the checks every pipeline makes: a first
 * choice with a message, a complete finish, and non-blank string content.
 * Returned untrimmed; callers that store text trim it themselves.
 */
export function readCompleteChoiceContent(response: unknown, fail: ChatResponseFailure): string {
  if (!isRecord(response) || !Array.isArray(response.choices) || response.choices.length === 0) fail();

  const choice: unknown = response.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) fail();

  if (INCOMPLETE_FINISH_REASONS.has(choice.finishReason) || INCOMPLETE_FINISH_REASONS.has(choice.finish_reason)) {
    fail();
  }

  const { content } = choice.message;
  if (typeof content !== "string" || content.trim().length === 0) fail();

  return content;
}

/** Structured-output replies: the content must be one JSON object, nothing else. */
export function parseStrictJsonObject(content: string, fail: ChatResponseFailure): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    fail();
  }

  if (!isRecord(parsed)) fail();

  return parsed;
}

export function readFinishReason(response: unknown): ChatFinishReason | undefined {
  const choice = isRecord(response) && Array.isArray(response.choices) ? (response.choices[0] as unknown) : undefined;
  if (!isRecord(choice)) return undefined;

  const finishReason = choice.finishReason ?? choice.finish_reason;
  if (KNOWN_FINISH_REASONS.has(finishReason)) return finishReason as ChatFinishReason;

  return typeof finishReason === "string" && finishReason.trim().length > 0 ? "unknown" : undefined;
}

/** Non-negative finite counts only, rounded; `undefined` when none is usable. */
export function readUsage(response: unknown): ChatTokenUsage | undefined {
  if (!isRecord(response) || !isRecord(response.usage)) return undefined;

  const { usage } = response;
  const counts: ChatTokenUsage = {};
  const promptTokens = toTokenCount(usage.promptTokens ?? usage.prompt_tokens);
  const completionTokens = toTokenCount(usage.completionTokens ?? usage.completion_tokens);
  const totalTokens = toTokenCount(usage.totalTokens ?? usage.total_tokens);

  if (promptTokens !== undefined) counts.promptTokens = promptTokens;
  if (completionTokens !== undefined) counts.completionTokens = completionTokens;
  if (totalTokens !== undefined) counts.totalTokens = totalTokens;

  return Object.keys(counts).length > 0 ? counts : undefined;
}

export function readResponseModel(response: unknown): string | undefined {
  if (!isRecord(response) || typeof response.model !== "string") return undefined;

  const model = response.model.trim();
  return model.length > 0 ? model : undefined;
}

/** The provider metadata the text pipelines return beside their parsed result. */
export function buildChatProviderMetadata(
  response: unknown,
  fallbackModel: string,
  provider: AiProviderName,
): ChatProviderMetadata {
  const finishReason = readFinishReason(response);
  const usage = readUsage(response);

  return {
    provider,
    model: readResponseModel(response) ?? fallbackModel,
    ...(finishReason ? { finishReason } : {}),
    ...(usage ? { usage } : {}),
  };
}

function toTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
