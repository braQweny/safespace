import { transcribeSessionAudioWithOpenRouter } from "./openrouter-transcription";
import type { SessionTranscriptionResponse, TranscribeSessionAudioInput } from "./types";

export interface SessionTranscriptionProvider {
  transcribeSessionAudio(input: TranscribeSessionAudioInput): Promise<SessionTranscriptionResponse>;
}

export const openRouterSessionTranscriptionProvider = {
  transcribeSessionAudio(input) {
    return transcribeSessionAudioWithOpenRouter(input);
  },
} satisfies SessionTranscriptionProvider;

export function transcribeSessionAudio(
  input: TranscribeSessionAudioInput,
  provider: SessionTranscriptionProvider = openRouterSessionTranscriptionProvider,
) {
  return provider.transcribeSessionAudio(input);
}
