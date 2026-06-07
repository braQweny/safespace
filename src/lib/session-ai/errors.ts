export const SESSION_AI_ERROR_CATEGORIES = [
  "missing_configuration",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "invalid_provider_response",
] as const;

export type SessionAiErrorCategory = (typeof SESSION_AI_ERROR_CATEGORIES)[number];

export class SessionAiError extends Error {
  readonly category: SessionAiErrorCategory;

  constructor(category: SessionAiErrorCategory) {
    super(category);
    this.name = "SessionAiError";
    this.category = category;
  }
}

export function isSessionAiErrorCategory(value: unknown): value is SessionAiErrorCategory {
  return typeof value === "string" && SESSION_AI_ERROR_CATEGORIES.includes(value as SessionAiErrorCategory);
}
