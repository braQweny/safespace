import type { OpenRouterReasoningEffort } from "@/lib/openrouter/env";

const OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN = /^openai\/(?:gpt-5(?:[.-]|$)|o\d(?:[.-]|$))/i;
const OPENAI_GPT_5_5_MODEL_PATTERN = /^openai\/gpt-5\.5(?:$|[-:])/i;
const OPENAI_GPT_5_6_LUNA_PRO_MODEL_PATTERN = /^openai\/gpt-5\.6-luna-pro(?:$|[-:])/i;
const GEMINI_3_1_FLASH_LITE_MODEL_PATTERN = /^google\/gemini-3\.1-flash-lite(?:$|[-:])/i;
const GEMINI_3_5_FLASH_MODEL_PATTERN = /^google\/gemini-3\.5-flash(?:$|[-:])/i;
const GEMINI_3_7_FLASH_MODEL_PATTERN = /^google\/gemini-3\.7-flash(?:$|[-:])/i;
const STEALTH_OX_ALPHA_MODEL_PATTERN = /^stealth\/ox-alpha(?:$|[-:])/i;

export function buildOpenRouterTokenLimitParameter(model: string, maxTokens: number) {
  if (usesMaxCompletionTokens(model)) {
    return {
      maxCompletionTokens: maxTokens,
    };
  }

  return {
    maxTokens,
  };
}

export function supportsOpenRouterTemperature(model: string) {
  return !usesMaxCompletionTokens(model);
}

/**
 * A configured effort (`OPENROUTER_SESSION_REASONING_EFFORT`) wins over the
 * per-model default; without one, only models with a known default get the
 * parameter at all.
 */
export function buildOpenRouterReasoningParameter(model: string, effortOverride?: OpenRouterReasoningEffort) {
  const effort = effortOverride ?? resolveOpenRouterReasoningEffort(model);

  if (!effort) {
    return {};
  }

  return {
    reasoning: {
      effort,
    },
  };
}

export function isOpenRouterGemini35FlashModel(model: string) {
  return GEMINI_3_5_FLASH_MODEL_PATTERN.test(model.trim());
}

export function isOpenRouterGemini37FlashModel(model: string) {
  return GEMINI_3_7_FLASH_MODEL_PATTERN.test(model.trim());
}

/**
 * Ox Alpha rozumuje przed odpowiedzią i przyjmuje `max_tokens` oraz
 * `temperature` (OpenRouter nie wystawia dla niego `max_completion_tokens`).
 */
export function isOpenRouterOxAlphaModel(model: string) {
  return STEALTH_OX_ALPHA_MODEL_PATTERN.test(model.trim());
}

function usesMaxCompletionTokens(model: string) {
  return OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN.test(model.trim());
}

function resolveOpenRouterReasoningEffort(model: string): OpenRouterReasoningEffort | undefined {
  const trimmedModel = model.trim();

  if (OPENAI_GPT_5_5_MODEL_PATTERN.test(trimmedModel)) {
    return "medium";
  }

  if (OPENAI_GPT_5_6_LUNA_PRO_MODEL_PATTERN.test(trimmedModel)) {
    return "medium";
  }

  if (isOpenRouterGemini35FlashModel(trimmedModel)) {
    return "medium";
  }

  // Gemini 3.7 Flash thinks by default even without a reasoning parameter;
  // pinning the effort keeps the hidden-token budget predictable.
  if (isOpenRouterGemini37FlashModel(trimmedModel)) {
    return "medium";
  }

  if (GEMINI_3_1_FLASH_LITE_MODEL_PATTERN.test(trimmedModel)) {
    return "medium";
  }

  if (isOpenRouterOxAlphaModel(trimmedModel)) {
    return "medium";
  }

  return undefined;
}
