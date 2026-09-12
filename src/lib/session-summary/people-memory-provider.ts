import { generatePeopleMemoryWithOpenRouter, generatePeopleMemoryWithAiProvider } from "./openrouter-people-memory";
import type { GeneratePeopleMemoryInput, PeopleMemoryResponse } from "./people-memory-types";

export interface GeneratePeopleMemoryOptions {
  timeoutMs?: number;
}

export interface PeopleMemoryProvider {
  generatePeopleMemory(
    input: GeneratePeopleMemoryInput,
    options?: GeneratePeopleMemoryOptions,
  ): Promise<PeopleMemoryResponse>;
}

export const configuredPeopleMemoryProvider = {
  generatePeopleMemory(input, options) {
    return generatePeopleMemoryWithAiProvider(input, { timeoutMs: options?.timeoutMs });
  },
} satisfies PeopleMemoryProvider;

export const openRouterPeopleMemoryProvider = {
  generatePeopleMemory(input, options) {
    return generatePeopleMemoryWithOpenRouter(input, {
      timeoutMs: options?.timeoutMs,
    });
  },
} satisfies PeopleMemoryProvider;

export function generatePeopleMemory(
  input: GeneratePeopleMemoryInput,
  provider: PeopleMemoryProvider = configuredPeopleMemoryProvider,
  options: GeneratePeopleMemoryOptions = {},
): Promise<PeopleMemoryResponse> {
  return provider.generatePeopleMemory(input, options);
}
