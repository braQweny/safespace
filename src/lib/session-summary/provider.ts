import { generateSessionSummaryWithOpenRouter, generateSessionSummaryWithAiProvider } from "./openrouter-summary";
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

export const configuredSessionSummaryProvider = {
  generateSessionSummary(input, options) {
    return generateSessionSummaryWithAiProvider(input, { timeoutMs: options?.timeoutMs });
  },
} satisfies SessionSummaryProvider;

export const openRouterSessionSummaryProvider = {
  generateSessionSummary(input, options) {
    return generateSessionSummaryWithOpenRouter(input, {
      timeoutMs: options?.timeoutMs,
    });
  },
} satisfies SessionSummaryProvider;

export function generateSessionSummary(
  input: GenerateSessionSummaryInput,
  provider: SessionSummaryProvider = configuredSessionSummaryProvider,
  options: GenerateSessionSummaryOptions = {},
): Promise<SessionSummaryResponse> {
  return provider.generateSessionSummary(input, options);
}
