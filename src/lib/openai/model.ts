// Only translate the provider prefix; never substitute a different model or
// silently route an OpenRouter-only variant (for example :free or :batch).
export function resolveOpenAiModel(model: string): string {
  const id = model.trim().replace(/^openai\//i, "");
  if (!id || /[/:\s]/.test(id)) throw new Error("invalid_openai_model_configuration");
  return id;
}
