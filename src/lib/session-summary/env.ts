import { getOpenRouterEnv, OPENROUTER_DEFAULT_MODEL, resolveOpenRouterModel } from "@/lib/openrouter/env";

// Session-summary owns its provider configuration instead of importing it
// from session-ai. `OPENROUTER_SUMMARY_MODEL` overrides the model for summaries
// alone; without it summaries follow the session model.

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
    model: env.summaryModel,
  };
}
