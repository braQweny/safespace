const OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN = /^openai\/(?:gpt-5(?:[.-]|$)|o\d(?:[.-]|$))/i;

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

function usesMaxCompletionTokens(model: string) {
  return OPENAI_MAX_COMPLETION_TOKENS_MODEL_PATTERN.test(model.trim());
}
