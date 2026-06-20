import {
  OPENROUTER_API_KEY,
  OPENROUTER_SAFETY_MODEL,
  OPENROUTER_SESSION_MODEL,
  OPENROUTER_TRANSCRIPTION_MODEL,
} from "astro:env/server";

// Single access point for OpenRouter environment configuration. Subsystems
// (session-ai, session-safety, session-summary) consume this instead of
// reading astro:env/server directly, so model fallbacks and the "is the
// provider configured at all" question have one answer.

export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
export const OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL = "openai/gpt-4o-mini-transcribe";

export interface OpenRouterEnv {
  apiKey?: string;
  sessionModel: string;
  safetyModel: string;
  transcriptionModel: string;
}

export function resolveOpenRouterModel(
  modelOverride?: string | null,
  fallbackModel: string = OPENROUTER_DEFAULT_MODEL,
) {
  const trimmedModel = modelOverride?.trim();

  return trimmedModel && trimmedModel.length > 0 ? trimmedModel : fallbackModel;
}

export function getOpenRouterEnv(): OpenRouterEnv {
  return {
    apiKey: OPENROUTER_API_KEY,
    sessionModel: resolveOpenRouterModel(OPENROUTER_SESSION_MODEL),
    safetyModel: resolveOpenRouterModel(OPENROUTER_SAFETY_MODEL),
    transcriptionModel: resolveOpenRouterModel(OPENROUTER_TRANSCRIPTION_MODEL, OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL),
  };
}

export function isOpenRouterConfigured() {
  return Boolean(OPENROUTER_API_KEY);
}
