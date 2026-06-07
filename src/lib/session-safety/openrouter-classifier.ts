import type { Fetcher } from "@openrouter/sdk";
import { OpenRouterChatError, sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import { OPENROUTER_API_KEY, OPENROUTER_SAFETY_MODEL } from "astro:env/server";

import { buildSessionSafetyClassifierUserContent, SESSION_SAFETY_CLASSIFIER_SYSTEM_PROMPT } from "./classifier-prompt";
import { parseProviderSafetyDecision } from "./parse-provider-decision";
import { ProviderSafetyError, type ProviderSafetyDecision, type SessionSafetyProvider } from "./provider";
import type { SessionSafetyInput } from "./types";

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
  fetcher?: Fetcher;
  timeoutMs?: number;
}

interface OpenRouterSafetyChatMessage {
  role: "system" | "user";
  content: string;
}

type OpenRouterSafetyRequestBody = OpenRouterNonStreamingChatRequest & {
  model: string;
  messages: OpenRouterSafetyChatMessage[];
  temperature: number;
  maxCompletionTokens: number;
  stream: false;
  provider: {
    requireParameters: true;
  };
  responseFormat: {
    type: "json_schema";
    jsonSchema: typeof OPENROUTER_SAFETY_RESPONSE_SCHEMA;
  };
};

export async function classifySessionSafetyWithOpenRouter(
  input: SessionSafetyInput,
  options: OpenRouterSafetyClassifierOptions = {},
): Promise<ProviderSafetyDecision> {
  const apiKey = options.apiKey ?? OPENROUTER_API_KEY;

  try {
    const response = await sendOpenRouterChat({
      apiKey,
      chatRequest: buildOpenRouterSafetyRequest(input, options.model),
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs),
    });

    return parseProviderSafetyDecision(response);
  } catch (error) {
    if (error instanceof ProviderSafetyError) {
      throw error;
    }

    if (error instanceof OpenRouterChatError) {
      throw new ProviderSafetyError(mapOpenRouterSafetyErrorCategory(error.category));
    }

    throw new ProviderSafetyError("provider_unavailable");
  }
}

export const openRouterSafetyProvider = {
  classify: classifySessionSafetyWithOpenRouter,
} satisfies SessionSafetyProvider;

export function buildOpenRouterSafetyRequest(
  input: SessionSafetyInput,
  modelOverride?: string,
): OpenRouterSafetyRequestBody {
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
    maxCompletionTokens: OPENROUTER_SAFETY_MAX_COMPLETION_TOKENS,
    stream: false,
    provider: {
      requireParameters: true,
    },
    responseFormat: {
      type: "json_schema",
      jsonSchema: OPENROUTER_SAFETY_RESPONSE_SCHEMA,
    },
  };
}

function resolveSafetyModel(modelOverride?: string) {
  const configuredModel = modelOverride ?? OPENROUTER_SAFETY_MODEL;
  const trimmedModel = configuredModel?.trim();

  return trimmedModel && trimmedModel.length > 0 ? trimmedModel : OPENROUTER_SAFETY_DEFAULT_MODEL;
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_SAFETY_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}

function mapOpenRouterSafetyErrorCategory(category: OpenRouterChatError["category"]) {
  if (category === "missing_configuration" || category === "invalid_provider_response") {
    return category;
  }

  return "provider_unavailable";
}
