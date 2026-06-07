import { OPENROUTER_API_KEY, OPENROUTER_SESSION_MODEL } from "astro:env/server";

export const OPENROUTER_SESSION_DEFAULT_MODEL = "openai/gpt-4o-mini";

export interface OpenRouterSessionConfig {
  apiKey?: string;
  model: string;
}

export function resolveSessionModel(modelOverride?: string | null) {
  const trimmedModel = modelOverride?.trim();

  return trimmedModel && trimmedModel.length > 0 ? trimmedModel : OPENROUTER_SESSION_DEFAULT_MODEL;
}

export function getOpenRouterSessionConfig(): OpenRouterSessionConfig {
  return {
    apiKey: OPENROUTER_API_KEY,
    model: resolveSessionModel(OPENROUTER_SESSION_MODEL),
  };
}
