import { AI_PROVIDER, OPENAI_API_KEY } from "astro:env/server";
import { getOpenRouterEnv } from "@/lib/openrouter/env";
import type { AiProviderName } from "./types";

export function getAiProviderName(): AiProviderName {
  // Unknown values must not silently send private data to another provider.
  const value = AI_PROVIDER?.trim().toLowerCase();
  if (!value || value === "openai") return "openai";
  if (value === "openrouter") return "openrouter";
  throw new Error("invalid_ai_provider_configuration");
}

export function getAiProviderEnv(provider: AiProviderName = getAiProviderName()) {
  // Keep the existing model/effort variables and all OpenRouter settings.
  // The OpenAI transport removes the openai/ prefix only at the API boundary.
  const env = getOpenRouterEnv();
  return { ...env, provider, apiKey: provider === "openai" ? OPENAI_API_KEY : env.apiKey };
}
