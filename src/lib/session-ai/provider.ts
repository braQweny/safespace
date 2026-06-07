import { generateSessionResponseWithOpenRouter } from "./openrouter-session-response";
import type { GenerateSessionResponseInput, SessionAiResponse } from "./types";

export interface SessionAiProvider {
  generateSessionResponse(input: GenerateSessionResponseInput): Promise<SessionAiResponse>;
}

export const openRouterSessionAiProvider = {
  generateSessionResponse: generateSessionResponseWithOpenRouter,
} satisfies SessionAiProvider;

export function generateSessionResponse(
  input: GenerateSessionResponseInput,
  provider: SessionAiProvider = openRouterSessionAiProvider,
): Promise<SessionAiResponse> {
  return provider.generateSessionResponse(input);
}
