import { transcribeSessionAudioWithOpenRouter } from "./openrouter-transcription";
import { transcribeSessionAudioWithOpenAi } from "./openai-transcription";
import { getAiProviderName } from "@/lib/ai-provider/env";
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
  provider: SessionTranscriptionProvider = configuredSessionTranscriptionProvider,
) {
  return provider.transcribeSessionAudio(input);
}

export const configuredSessionTranscriptionProvider = {
  transcribeSessionAudio(input) {
    return getAiProviderName() === "openai"
      ? transcribeSessionAudioWithOpenAi(input)
      : transcribeSessionAudioWithOpenRouter(input);
  },
} satisfies SessionTranscriptionProvider;
