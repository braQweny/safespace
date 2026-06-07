import { generateSessionResponseWithOpenRouter } from "./openrouter-session-response";
import type { GenerateSessionResponseInput, SessionAiResponse } from "./types";

export interface GenerateSessionResponseOptions {
  timeoutMs?: number;
}

export interface SessionAiProvider {
  generateSessionResponse(
    input: GenerateSessionResponseInput,
    options?: GenerateSessionResponseOptions,
  ): Promise<SessionAiResponse>;
}

export const openRouterSessionAiProvider = {
  generateSessionResponse(input, options) {
    return generateSessionResponseWithOpenRouter(input, {
      timeoutMs: options?.timeoutMs,
    });
  },
} satisfies SessionAiProvider;

export function generateSessionResponse(
  input: GenerateSessionResponseInput,
  provider: SessionAiProvider = openRouterSessionAiProvider,
  options: GenerateSessionResponseOptions = {},
): Promise<SessionAiResponse> {
  return provider.generateSessionResponse(input, options);
}
