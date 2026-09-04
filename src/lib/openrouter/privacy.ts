/**
 * Private provider routing for every chat-completions request that can contain
 * session data. OpenRouter otherwise permits data-collecting endpoints by
 * default. If no provider satisfies both constraints, the request must fail
 * instead of silently weakening privacy.
 */
export const OPENROUTER_PRIVATE_PROVIDER_PREFERENCES = {
  dataCollection: "deny",
  requireParameters: true,
  zdr: true,
} as const;

export type OpenRouterPrivateProviderPreferences = typeof OPENROUTER_PRIVATE_PROVIDER_PREFERENCES & {
  order?: string[];
  allowFallbacks?: boolean;
};

export function getOpenRouterPrivateProviderPreferences(model: string): OpenRouterPrivateProviderPreferences {
  // The base Luna model's default Azure route repeatedly returned upstream
  // 429s while azure/eu completed the same requests with ZDR enforced. Prefer
  // that exact endpoint, keeping other privacy-compatible endpoints available.
  // Other Luna variants have separate availability and are not pinned here.
  if (model.trim().toLowerCase() === "openai/gpt-5.6-luna") {
    return {
      ...OPENROUTER_PRIVATE_PROVIDER_PREFERENCES,
      order: ["azure/eu"],
      allowFallbacks: true,
    };
  }

  return OPENROUTER_PRIVATE_PROVIDER_PREFERENCES;
}
