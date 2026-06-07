import { generateSessionSummaryWithOpenRouter } from "./openrouter-summary";
import type { GenerateSessionSummaryInput, SessionSummaryResponse } from "./types";

export interface GenerateSessionSummaryOptions {
  timeoutMs?: number;
}

export interface SessionSummaryProvider {
  generateSessionSummary(
    input: GenerateSessionSummaryInput,
    options?: GenerateSessionSummaryOptions,
  ): Promise<SessionSummaryResponse>;
}

export const openRouterSessionSummaryProvider = {
  generateSessionSummary(input, options) {
    return generateSessionSummaryWithOpenRouter(input, {
      timeoutMs: options?.timeoutMs,
    });
  },
} satisfies SessionSummaryProvider;

export function generateSessionSummary(
  input: GenerateSessionSummaryInput,
  provider: SessionSummaryProvider = openRouterSessionSummaryProvider,
  options: GenerateSessionSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  return provider.generateSessionSummary(input, options);
}
