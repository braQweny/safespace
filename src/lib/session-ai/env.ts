import { getOpenRouterEnv, OPENROUTER_DEFAULT_MODEL, resolveOpenRouterModel } from "@/lib/openrouter/env";

export const OPENROUTER_SESSION_DEFAULT_MODEL = OPENROUTER_DEFAULT_MODEL;

export interface OpenRouterSessionConfig {
  apiKey?: string;
  model: string;
}

export function resolveSessionModel(modelOverride?: string | null) {
  return resolveOpenRouterModel(modelOverride, OPENROUTER_SESSION_DEFAULT_MODEL);
}

export function getOpenRouterSessionConfig(): OpenRouterSessionConfig {
  const env = getOpenRouterEnv();

  return {
    apiKey: env.apiKey,
    model: env.sessionModel,
  };
}
