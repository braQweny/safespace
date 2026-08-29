import {
  OPENROUTER_API_KEY,
  OPENROUTER_SAFETY_MODEL,
  OPENROUTER_SESSION_MODEL,
  OPENROUTER_SESSION_REASONING_EFFORT,
  OPENROUTER_SUMMARY_MODEL,
  OPENROUTER_TRANSCRIPTION_MODEL,
} from "astro:env/server";

// Single access point for OpenRouter environment configuration. Subsystems
// (session-ai, session-safety, session-summary) consume this instead of
// reading astro:env/server directly, so model fallbacks and the "is the
// provider configured at all" question have one answer.

export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
export const OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL = "openai/gpt-4o-mini-transcribe";

/**
 * OpenRouter's normalized reasoning effort scale (`reasoning.effort`). The
 * router maps it onto each provider's own knob, so one vocabulary covers
 * OpenAI, Gemini and stealth models alike.
 */
export const OPENROUTER_REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type OpenRouterReasoningEffort = (typeof OPENROUTER_REASONING_EFFORTS)[number];

export interface OpenRouterEnv {
  apiKey?: string;
  sessionModel: string;
  safetyModel: string;
  summaryModel: string;
  transcriptionModel: string;
  /**
   * Effort override for ordinary session responses only. Absent means "the
   * per-model default from session-ai/openrouter-request-params.ts".
   */
  sessionReasoningEffort?: OpenRouterReasoningEffort;
}

export function resolveOpenRouterModel(
  modelOverride?: string | null,
  fallbackModel: string = OPENROUTER_DEFAULT_MODEL,
) {
  const trimmedModel = modelOverride?.trim();

  return trimmedModel && trimmedModel.length > 0 ? trimmedModel : fallbackModel;
}

/**
 * An unknown value is treated as "not set" rather than passed through: with
 * `requireParameters` a request carrying an effort no provider understands
 * would not route at all, and every session turn would fail closed.
 */
export function parseOpenRouterReasoningEffort(
  value: string | null | undefined,
): OpenRouterReasoningEffort | undefined {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return OPENROUTER_REASONING_EFFORTS.find((effort) => effort === normalized);
}

export function getOpenRouterEnv(): OpenRouterEnv {
  const sessionModel = resolveOpenRouterModel(OPENROUTER_SESSION_MODEL);

  return {
    apiKey: OPENROUTER_API_KEY,
    sessionModel,
    safetyModel: resolveOpenRouterModel(OPENROUTER_SAFETY_MODEL),
    // Summaries are a separate, much shorter generation than a session turn, so
    // they get their own override and only fall back to the session model.
    summaryModel: resolveOpenRouterModel(OPENROUTER_SUMMARY_MODEL, sessionModel),
    transcriptionModel: resolveOpenRouterModel(OPENROUTER_TRANSCRIPTION_MODEL, OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL),
    sessionReasoningEffort: parseOpenRouterReasoningEffort(OPENROUTER_SESSION_REASONING_EFFORT),
  };
}

export function isOpenRouterConfigured() {
  return Boolean(OPENROUTER_API_KEY);
}
