import { getOpenRouterEnv, OPENROUTER_DEFAULT_MODEL, resolveOpenRouterModel } from "@/lib/openrouter/env";

// Session-summary owns its provider configuration instead of importing it
// from session-ai: both currently point at the same session model, but the
// subsystems stay independently configurable.

export const OPENROUTER_SUMMARY_DEFAULT_MODEL = OPENROUTER_DEFAULT_MODEL;

export interface OpenRouterSummaryConfig {
  apiKey?: string;
  model: string;
}

export function resolveSummaryModel(modelOverride?: string | null) {
  return resolveOpenRouterModel(modelOverride, OPENROUTER_SUMMARY_DEFAULT_MODEL);
}

export function getOpenRouterSummaryConfig(): OpenRouterSummaryConfig {
  const env = getOpenRouterEnv();

  return {
    apiKey: env.apiKey,
    model: env.sessionModel,
  };
}
