export const SESSION_TRANSCRIPTION_ERROR_CATEGORIES = [
  "missing_configuration",
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "invalid_provider_response",
] as const;

export type SessionTranscriptionErrorCategory = (typeof SESSION_TRANSCRIPTION_ERROR_CATEGORIES)[number];

export class SessionTranscriptionError extends Error {
  readonly category: SessionTranscriptionErrorCategory;

  constructor(category: SessionTranscriptionErrorCategory) {
    super(category);
    this.name = "SessionTranscriptionError";
    this.category = category;
  }
}
