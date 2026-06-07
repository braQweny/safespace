export const SESSION_SUMMARY_ERROR_CATEGORIES = [
  "missing_configuration",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "invalid_provider_response",
] as const;

export type SessionSummaryErrorCategory = (typeof SESSION_SUMMARY_ERROR_CATEGORIES)[number];

export class SessionSummaryError extends Error {
  readonly category: SessionSummaryErrorCategory;

  constructor(category: SessionSummaryErrorCategory) {
    super(category);
    this.name = "SessionSummaryError";
    this.category = category;
  }
}

export function isSessionSummaryErrorCategory(value: unknown): value is SessionSummaryErrorCategory {
  return typeof value === "string" && SESSION_SUMMARY_ERROR_CATEGORIES.includes(value as SessionSummaryErrorCategory);
}
