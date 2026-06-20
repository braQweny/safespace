import { getOpenRouterEnv, OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL, resolveOpenRouterModel } from "@/lib/openrouter/env";

export { OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL } from "@/lib/openrouter/env";

export interface OpenRouterTranscriptionConfig {
  apiKey?: string;
  model: string;
}

export function resolveTranscriptionModel(modelOverride?: string | null) {
  return resolveOpenRouterModel(modelOverride, OPENROUTER_TRANSCRIPTION_DEFAULT_MODEL);
}

export function getOpenRouterTranscriptionConfig(): OpenRouterTranscriptionConfig {
  const env = getOpenRouterEnv();

  return {
    apiKey: env.apiKey,
    model: resolveTranscriptionModel(env.transcriptionModel),
  };
}
