import type { Locale } from "@/lib/i18n/locale";

export type SessionTranscriptionFormat = "webm";

export interface TranscribeSessionAudioInput {
  audioBase64: string;
  format: SessionTranscriptionFormat;
  /** Język dyktowania — język interfejsu w chwili żądania. */
  language: Locale;
}

export interface SessionTranscriptionProviderMetadata {
  provider: "openrouter";
  model: string;
}

export interface SessionTranscriptionResponse {
  text: string;
  providerMetadata: SessionTranscriptionProviderMetadata;
}
