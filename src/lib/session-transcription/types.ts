export type SessionTranscriptionFormat = "webm";

export interface TranscribeSessionAudioInput {
  audioBase64: string;
  format: SessionTranscriptionFormat;
}

export interface SessionTranscriptionProviderMetadata {
  provider: "openrouter";
  model: string;
}

export interface SessionTranscriptionResponse {
  text: string;
  providerMetadata: SessionTranscriptionProviderMetadata;
}
