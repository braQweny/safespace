import { isRecord } from "@/lib/type-guards";
import { SESSION_LENS_LABELS } from "./classifier-prompt";
import { SessionLensProviderError, type ProviderLensDecision, type ProviderLensLabel } from "./types";

const DECISION_KEYS = new Set(["lens"]);

/**
 * Zamknięty parser jak w klasyfikatorze bezpieczeństwa: cokolwiek poza
 * `{ lens: <etykieta> }` to `invalid_provider_response`. Różnica jest wyżej —
 * `detectSessionLens` zamienia każdy błąd na brak soczewki, nigdy na blokadę.
 */
export function parseProviderLensDecision(response: unknown): ProviderLensDecision {
  const content = extractFirstChoiceContent(response);
  const decision = parseDecisionContent(content);

  return { lens: parseProviderLensDecisionObject(decision), ...pickUsage(response) };
}

export function parseProviderLensDecisionObject(decision: Record<string, unknown>): ProviderLensLabel {
  if (Object.keys(decision).some((key) => !DECISION_KEYS.has(key))) {
    throwInvalidProviderResponse();
  }

  const { lens } = decision;
  if (typeof lens === "string" && (SESSION_LENS_LABELS as readonly string[]).includes(lens)) {
    return lens as ProviderLensLabel;
  }

  throwInvalidProviderResponse();
}

function extractFirstChoiceContent(response: unknown) {
  if (!isRecord(response) || !Array.isArray(response.choices) || response.choices.length === 0) {
    throwInvalidProviderResponse();
  }

  const firstChoice: unknown = response.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throwInvalidProviderResponse();
  }

  // Ucięta lub odfiltrowana odpowiedź nie niesie etykiety, na której można
  // polegać. SDK normalizuje pole do `finishReason`; surowy kształt też odpada.
  for (const finishReason of [firstChoice.finishReason, firstChoice.finish_reason]) {
    if (finishReason === "length" || finishReason === "content_filter" || finishReason === "tool_calls") {
      throwInvalidProviderResponse();
    }
  }

  const { content } = firstChoice.message;
  if (typeof content !== "string" || content.trim().length === 0) {
    throwInvalidProviderResponse();
  }

  return content;
}

function parseDecisionContent(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throwInvalidProviderResponse();
  }

  if (!isRecord(parsed)) {
    throwInvalidProviderResponse();
  }

  return parsed;
}

function pickUsage(response: unknown): Pick<ProviderLensDecision, "usage"> {
  if (!isRecord(response) || !isRecord(response.usage)) {
    return {};
  }

  const promptTokens = toUnitCount(response.usage.promptTokens ?? response.usage.prompt_tokens);
  const completionTokens = toUnitCount(response.usage.completionTokens ?? response.usage.completion_tokens);
  if (promptTokens === undefined && completionTokens === undefined) {
    return {};
  }

  return {
    usage: {
      ...(promptTokens !== undefined ? { promptTokens } : {}),
      ...(completionTokens !== undefined ? { completionTokens } : {}),
    },
  };
}

function toUnitCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

function throwInvalidProviderResponse(): never {
  throw new SessionLensProviderError("invalid_provider_response");
}
