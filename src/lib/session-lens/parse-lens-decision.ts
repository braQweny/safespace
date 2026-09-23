import { parseStrictJsonObject, readCompleteChoiceContent, readUsage } from "@/lib/ai-provider/chat-response";
import { SESSION_LENS_LABELS } from "./classifier-prompt";
import { SessionLensProviderError, type ProviderLensDecision, type ProviderLensLabel } from "./types";

const DECISION_KEYS = new Set(["lens"]);

/**
 * Zamknięty parser jak w klasyfikatorze bezpieczeństwa: cokolwiek poza
 * `{ lens: <etykieta> }` to `invalid_provider_response`. Różnica jest wyżej —
 * `detectSessionLens` zamienia każdy błąd na brak soczewki, nigdy na blokadę.
 */
export function parseProviderLensDecision(response: unknown): ProviderLensDecision {
  // Ucięta lub odfiltrowana odpowiedź nie niesie etykiety, na której można
  // polegać — `readCompleteChoiceContent` ją odrzuca.
  const content = readCompleteChoiceContent(response, throwInvalidProviderResponse);
  const decision = parseStrictJsonObject(content, throwInvalidProviderResponse);

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

function pickUsage(response: unknown): Pick<ProviderLensDecision, "usage"> {
  // Soczewka loguje tylko jednostki wejścia i wyjścia, bez sumy.
  const { promptTokens, completionTokens } = readUsage(response) ?? {};
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

function throwInvalidProviderResponse(): never {
  throw new SessionLensProviderError("invalid_provider_response");
}
