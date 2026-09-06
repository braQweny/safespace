import type { Fetcher } from "@openrouter/sdk";
import { getOpenRouterEnv, resolveOpenRouterModel } from "@/lib/openrouter/env";
import {
  getOpenRouterPrivateProviderPreferences,
  type OpenRouterPrivateProviderPreferences,
} from "@/lib/openrouter/privacy";
import {
  OpenRouterChatError,
  sendOpenRouterChat,
  type OpenRouterNonStreamingChatRequest,
} from "@/lib/openrouter/sdk-chat";
import { isOpenRouterGpt56LunaModel, supportsOpenRouterTemperature } from "@/lib/session-ai/openrouter-request-params";
import {
  buildSessionLensClassifierUserContent,
  SESSION_LENS_CLASSIFIER_SYSTEM_PROMPT,
  SESSION_LENS_LABELS,
} from "./classifier-prompt";
import { parseProviderLensDecision } from "./parse-lens-decision";
import {
  SessionLensProviderError,
  type DetectSessionLensOptions,
  type ProviderLensDecision,
  type SessionLensInput,
  type SessionLensProvider,
} from "./types";

// Ten sam tani model co klasyfikator bezpieczeństwa; osobne wywołanie i osobna
// schema, nigdy rozszerzenie klasyfikatora (jego zamknięty parser jest
// fail-closed dla każdej wiadomości). Krótszy limit czasu niż bezpieczeństwo
// i bez ponowienia: soczewka nie ma prawa wydłużyć tury.
const OPENROUTER_LENS_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_LENS_TIMEOUT_MS = 6_000;
const OPENROUTER_LENS_MAX_COMPLETION_TOKENS = 64;
// Model rozumujący wydaje ukryte tokeny z tego samego budżetu; 64 dałoby
// `finish_reason: "length"` i brak soczewki w każdej turze.
const OPENROUTER_LENS_REASONING_MAX_COMPLETION_TOKENS = 256;
const OPENROUTER_LENS_TEMPERATURE = 0;

export const OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA = {
  name: "safespace_session_lens",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      lens: {
        type: "string",
        enum: SESSION_LENS_LABELS,
        description: "The one thematic lens that chiefly fits the current user text, or none.",
      },
    },
    required: ["lens"],
  },
} as const;

interface OpenRouterSessionLensOptions extends DetectSessionLensOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
}

type OpenRouterSessionLensRequestBody = OpenRouterNonStreamingChatRequest & {
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  temperature?: number;
  maxCompletionTokens: number;
  reasoning?: { effort: "minimal" };
  stream: false;
  provider: OpenRouterPrivateProviderPreferences;
  responseFormat: { type: "json_schema"; jsonSchema: typeof OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA };
};

export async function detectSessionLensWithOpenRouter(
  input: SessionLensInput,
  options: OpenRouterSessionLensOptions = {},
): Promise<ProviderLensDecision> {
  const apiKey = options.apiKey ?? getOpenRouterEnv().apiKey;
  const chatRequest = buildOpenRouterSessionLensRequest(input, options.model);

  try {
    const response = await sendOpenRouterChat({
      apiKey,
      chatRequest,
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs),
    });

    return parseProviderLensDecision(response);
  } catch (error) {
    if (error instanceof SessionLensProviderError) {
      throw error;
    }

    throw new SessionLensProviderError(error instanceof OpenRouterChatError ? error.category : "provider_unavailable");
  }
}

export const openRouterSessionLensProvider = {
  detect(input, options) {
    return detectSessionLensWithOpenRouter(input, { timeoutMs: options?.timeoutMs });
  },
} satisfies SessionLensProvider;

export function buildOpenRouterSessionLensRequest(
  input: SessionLensInput,
  modelOverride?: string,
): OpenRouterSessionLensRequestBody {
  const model = resolveOpenRouterModel(modelOverride ?? getOpenRouterEnv().safetyModel, OPENROUTER_LENS_DEFAULT_MODEL);
  const minimalReasoning = isOpenRouterGpt56LunaModel(model);

  return {
    model,
    messages: [
      { role: "system", content: SESSION_LENS_CLASSIFIER_SYSTEM_PROMPT },
      { role: "user", content: buildSessionLensClassifierUserContent(input) },
    ],
    ...(supportsOpenRouterTemperature(model) ? { temperature: OPENROUTER_LENS_TEMPERATURE } : {}),
    ...(minimalReasoning ? { reasoning: { effort: "minimal" as const } } : {}),
    maxCompletionTokens: minimalReasoning
      ? OPENROUTER_LENS_REASONING_MAX_COMPLETION_TOKENS
      : OPENROUTER_LENS_MAX_COMPLETION_TOKENS,
    stream: false,
    provider: getOpenRouterPrivateProviderPreferences(model),
    responseFormat: { type: "json_schema", jsonSchema: OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA },
  };
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_LENS_TIMEOUT_MS;
  }

  return Math.min(Math.round(timeoutMs), OPENROUTER_LENS_TIMEOUT_MS);
}
