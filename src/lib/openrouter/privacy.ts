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

export type OpenRouterPrivateProviderPreferences = typeof OPENROUTER_PRIVATE_PROVIDER_PREFERENCES;
