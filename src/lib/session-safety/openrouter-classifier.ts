import { OPENROUTER_API_KEY, OPENROUTER_SAFETY_MODEL } from "astro:env/server";

import { buildSessionSafetyClassifierUserContent, SESSION_SAFETY_CLASSIFIER_SYSTEM_PROMPT } from "./classifier-prompt";
import { parseProviderSafetyDecision } from "./parse-provider-decision";
import { ProviderSafetyError, type ProviderSafetyDecision, type SessionSafetyProvider } from "./provider";
import type { SessionSafetyInput } from "./types";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_SAFETY_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_SAFETY_TIMEOUT_MS = 8_000;
const OPENROUTER_SAFETY_MAX_COMPLETION_TOKENS = 64;

const OPENROUTER_SAFETY_RESPONSE_SCHEMA = {
  name: "safespace_session_safety_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      risk: {
        type: "string",
        enum: ["normal", "caution", "crisis"],
        description: "Safety risk level for the current user text only.",
      },
      action: {
        type: "string",
        enum: ["allow", "allow_with_constraints", "hard_stop"],
        description: "Routing action implied by the risk level.",
      },
      reasonCode: {
        type: "string",
        enum: [
          "none_detected",
          "ambiguous_distress",
          "self_harm_signal",
          "harm_to_others_signal",
          "immediate_danger_signal",
        ],
        description: "Stable generic reason code. Do not include private text.",
      },
    },
    required: ["risk", "action", "reasonCode"],
  },
} as const;

interface OpenRouterSafetyClassifierOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

interface OpenRouterChatMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterSafetyRequestBody {
  model: string;
  messages: readonly OpenRouterChatMessage[];
  temperature: number;
  max_completion_tokens: number;
  stream: false;
  provider: {
    require_parameters: true;
  };
  response_format: {
    type: "json_schema";
    json_schema: typeof OPENROUTER_SAFETY_RESPONSE_SCHEMA;
  };
}

export async function classifySessionSafetyWithOpenRouter(
  input: SessionSafetyInput,
  options: OpenRouterSafetyClassifierOptions = {},
): Promise<ProviderSafetyDecision> {
  const apiKey = options.apiKey ?? OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ProviderSafetyError("missing_configuration");
  }

  const fetcher = options.fetcher ?? fetch;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, options.timeoutMs ?? OPENROUTER_SAFETY_TIMEOUT_MS);

  try {
    const response = await fetcher(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenRouterSafetyRequest(input, options.model)),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new ProviderSafetyError("provider_unavailable");
    }

    const responseBody: unknown = await response.json();
    return parseProviderSafetyDecision(responseBody);
  } catch (error) {
    if (error instanceof ProviderSafetyError) {
      throw error;
    }

    throw new ProviderSafetyError("provider_unavailable");
  } finally {
    clearTimeout(timeoutId);
  }
}

export const openRouterSafetyProvider = {
  classify: classifySessionSafetyWithOpenRouter,
} satisfies SessionSafetyProvider;

function buildOpenRouterSafetyRequest(input: SessionSafetyInput, modelOverride?: string): OpenRouterSafetyRequestBody {
  const model = resolveSafetyModel(modelOverride);

  return {
    model,
    messages: [
      {
        role: "system",
        content: SESSION_SAFETY_CLASSIFIER_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildSessionSafetyClassifierUserContent(input),
      },
    ],
    temperature: 0,
    max_completion_tokens: OPENROUTER_SAFETY_MAX_COMPLETION_TOKENS,
    stream: false,
    provider: {
      require_parameters: true,
    },
    response_format: {
      type: "json_schema",
      json_schema: OPENROUTER_SAFETY_RESPONSE_SCHEMA,
    },
  };
}

function resolveSafetyModel(modelOverride?: string) {
  const configuredModel = modelOverride ?? OPENROUTER_SAFETY_MODEL;
  const trimmedModel = configuredModel?.trim();

  return trimmedModel && trimmedModel.length > 0 ? trimmedModel : OPENROUTER_SAFETY_DEFAULT_MODEL;
}
