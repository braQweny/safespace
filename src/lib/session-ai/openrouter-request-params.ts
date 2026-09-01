import type { OpenRouterReasoningEffort } from "@/lib/openrouter/env";

const OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN = /^openai\/(?:gpt-5(?:[.-]|$)|o\d(?:[.-]|$))/i;
const OPENAI_GPT_5_5_MODEL_PATTERN = /^openai\/gpt-5\.5(?:$|[-:])/i;
// Whole GPT-5.6 Luna family: base, `-pro` and the `:batch` variants. The
// classifier already treats them as one reasoning family; the session and
// summary paths must agree, otherwise a model that reasons by default eats its
// visible budget and comes back as `finish_reason: "length"`.
const OPENAI_GPT_5_6_LUNA_MODEL_PATTERN = /^openai\/gpt-5\.6-luna(?:$|[-:])/i;
const GEMINI_3_1_FLASH_LITE_MODEL_PATTERN = /^google\/gemini-3\.1-flash-lite(?:$|[-:])/i;
const GEMINI_3_5_FLASH_MODEL_PATTERN = /^google\/gemini-3\.5-flash(?:$|[-:])/i;
const GEMINI_3_7_FLASH_MODEL_PATTERN = /^google\/gemini-3\.7-flash(?:$|[-:])/i;
const STEALTH_OX_ALPHA_MODEL_PATTERN = /^stealth\/ox-alpha(?:$|[-:])/i;

// Provider timeout for one session reply. A forced high effort thinks for a
// long time before the first visible token, so the ceiling grows with it. The
// message route additionally clips the value to the session's remaining time.
const OPENROUTER_SESSION_TIMEOUT_MS = 12_000;
const OPENROUTER_HIGH_REASONING_SESSION_TIMEOUT_MS = 30_000;
const OPENROUTER_XHIGH_REASONING_SESSION_TIMEOUT_MS = 60_000;

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

/**
 * Ceiling for a single session reply at the given effort. `undefined` means
 * "the model's own default", which never needs more than the base ceiling.
 */
export function resolveSessionReasoningTimeoutMs(reasoningEffort?: OpenRouterReasoningEffort) {
  if (reasoningEffort === "xhigh") {
    return OPENROUTER_XHIGH_REASONING_SESSION_TIMEOUT_MS;
  }

  if (reasoningEffort === "high") {
    return OPENROUTER_HIGH_REASONING_SESSION_TIMEOUT_MS;
  }

  return OPENROUTER_SESSION_TIMEOUT_MS;
}

export function isOpenRouterGemini35FlashModel(model: string) {
  return GEMINI_3_5_FLASH_MODEL_PATTERN.test(model.trim());
}

export function isOpenRouterGemini37FlashModel(model: string) {
  return GEMINI_3_7_FLASH_MODEL_PATTERN.test(model.trim());
}

export function isOpenRouterGpt56LunaModel(model: string) {
  return OPENAI_GPT_5_6_LUNA_MODEL_PATTERN.test(model.trim());
}

/**
 * Ox Alpha rozumuje przed odpowiedzią i przyjmuje `max_tokens` oraz
 * `temperature` (OpenRouter nie wystawia dla niego `max_completion_tokens`).
 */
export function isOpenRouterOxAlphaModel(model: string) {
  return STEALTH_OX_ALPHA_MODEL_PATTERN.test(model.trim());
}

/**
 * True when the request will carry a `reasoning` parameter for this model at
 * the given effort — i.e. hidden thinking is billed against the completion
 * budget and the token cap must leave room for it.
 */
export function usesOpenRouterReasoningBudget(model: string, effortOverride?: OpenRouterReasoningEffort) {
  return Boolean(effortOverride ?? resolveOpenRouterReasoningEffort(model));
}

function usesMaxCompletionTokens(model: string) {
  return OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN.test(model.trim());
}

function resolveOpenRouterReasoningEffort(model: string): OpenRouterReasoningEffort | undefined {
  const trimmedModel = model.trim();

  if (OPENAI_GPT_5_5_MODEL_PATTERN.test(trimmedModel)) {
    return "medium";
  }

  // The whole Luna family reasons; pinning the effort keeps the hidden-token
  // budget predictable instead of leaving it to the provider's default.
  if (isOpenRouterGpt56LunaModel(trimmedModel)) {
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
