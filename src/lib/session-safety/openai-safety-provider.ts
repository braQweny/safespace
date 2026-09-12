import { sendOpenAiChat } from "@/lib/openai/chat";
import { classifySessionSafetyWithSender } from "./openrouter-classifier";
import type { SessionSafetyProvider } from "./provider";

export interface OpenAiSafetyProviderOptions {
  /** Klucz z bindingów Workera (`env.OPENAI_API_KEY`), nigdy z `astro:env/server`. */
  apiKey: string;
  /** Np. `openai/gpt-5.6-luna` — transport OpenAI zdejmuje prefiks przy wysyłce. */
  model: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Klasyfikator bezpieczeństwa z jawną konfiguracją, dla kodu działającego
 * poza żądaniem Astro (Durable Object obserwatora rozmowy głosowej). Ten sam
 * prompt, schemat odpowiedzi, ponowienie i kategorie błędów co
 * `configuredSafetyProvider`; różni się tylko źródłem klucza i modelu.
 */
export function createOpenAiSafetyProvider(options: OpenAiSafetyProviderOptions): SessionSafetyProvider {
  return {
    classify: (input) =>
      classifySessionSafetyWithSender(
        input,
        options.model,
        (chatRequest, timeoutMs) =>
          sendOpenAiChat({ apiKey: options.apiKey, chatRequest, fetcher: options.fetcher, timeoutMs }),
        options.timeoutMs,
      ),
  };
}
