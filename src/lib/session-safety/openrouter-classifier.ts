import { getAiProviderEnv } from "@/lib/ai-provider/env";
import type { AiProviderName } from "@/lib/ai-provider/types";
import { sendAiChat } from "@/lib/ai-provider/chat";
import type { Fetcher } from "@openrouter/sdk";
import { OpenRouterChatError } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import { getOpenRouterEnv, resolveOpenRouterModel } from "@/lib/openrouter/env";
import {
  getOpenRouterPrivateProviderPreferences,
  type OpenRouterPrivateProviderPreferences,
} from "@/lib/openrouter/privacy";

import { buildSessionSafetyClassifierUserContent, SESSION_SAFETY_CLASSIFIER_SYSTEM_PROMPT } from "./classifier-prompt";
import { parseProviderSafetyDecision } from "./parse-provider-decision";
import { ProviderSafetyError, type ProviderSafetyDecision, type SessionSafetyProvider } from "./provider";
import type { SessionSafetyInput } from "./types";

const OPENROUTER_SAFETY_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_SAFETY_TIMEOUT_MS = 8_000;
// One extra attempt after a fast provider-side failure (5xx / 429). A timeout
// is not retried: it already spent the whole budget, and a fail-closed reply
// beats doubling the wait. Without this a single blip ended the user's turn.
const OPENROUTER_SAFETY_MAX_ATTEMPTS = 2;
const OPENROUTER_SAFETY_RETRY_DELAY_MS = 500;
const OPENROUTER_SAFETY_RETRYABLE_CATEGORIES = new Set<OpenRouterChatError["category"]>([
  "provider_unavailable",
  "provider_rate_limited",
]);
const OPENROUTER_SAFETY_MAX_COMPLETION_TOKENS = 64;
// Reasoning models spend hidden reasoning tokens from the same completion
// budget; with the 64-token cap that risks finish_reason "length" and a
// fail-closed hard_stop on every message, so they get extra headroom.
const OPENROUTER_SAFETY_REASONING_MAX_COMPLETION_TOKENS = 256;
const OPENROUTER_SAFETY_TEMPERATURE = 0;

// Mirrors session-ai/openrouter-request-params.ts: OpenAI gpt-5/o-series
// models reject a non-default temperature, and with requireParameters such a
// request would not route at all.
const OPENAI_NO_TEMPERATURE_MODEL_PATTERN = /^openai\/(?:gpt-5(?:[.-]|$)|o\d(?:[.-]|$))/i;
// GPT-5.6 Luna family (base, -pro, :batch). Classification is a simple
// structured-output task, so the classifier always asks for minimal effort.
const OPENAI_GPT_5_6_LUNA_MODEL_PATTERN = /^openai\/gpt-5\.6-luna(?:$|[-:])/i;

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
  provider?: AiProviderName;
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
  temperature?: number;
  maxCompletionTokens: number;
  reasoning?: {
    effort: "minimal";
  };
  stream: false;
  provider: OpenRouterPrivateProviderPreferences;
  responseFormat: {
    type: "json_schema";
    jsonSchema: typeof OPENROUTER_SAFETY_RESPONSE_SCHEMA;
  };
};

export function classifySessionSafetyWithOpenRouter(
  input: SessionSafetyInput,
  options: OpenRouterSafetyClassifierOptions = {},
): Promise<ProviderSafetyDecision> {
  return classifySessionSafetyWithAiProvider(input, { ...options, provider: "openrouter" });
}

export async function classifySessionSafetyWithAiProvider(
  input: SessionSafetyInput,
  options: OpenRouterSafetyClassifierOptions = {},
): Promise<ProviderSafetyDecision> {
  const config = getAiProviderEnv(options.provider);
  const apiKey = options.apiKey ?? config.apiKey;

  return classifySessionSafetyWithSender(
    input,
    options.model ?? config.safetyModel,
    (chatRequest, timeoutMs) =>
      sendAiChat({
        provider: config.provider,
        apiKey,
        chatRequest,
        fetcher: options.fetcher,
        timeoutMs,
      }),
    options.timeoutMs,
  );
}

/** Jedno wywołanie transportu; `classifySessionSafetyWithSender` dokłada ponowienie i mapowanie błędów. */
export type SafetyChatSender = (chatRequest: OpenRouterSafetyRequestBody, timeoutMs: number) => Promise<unknown>;

/**
 * Wspólna pętla klasyfikatora dla dowolnego transportu: buduje żądanie z
 * jawnie podanym modelem, ponawia raz po szybkiej awarii dostawcy i zamyka
 * błędy do kategorii. Obserwator rozmowy głosowej używa jej z kluczem z
 * bindingów Workera, bez `astro:env/server` (poza żądaniem Astro nie ma env).
 */
export async function classifySessionSafetyWithSender(
  input: SessionSafetyInput,
  model: string,
  send: SafetyChatSender,
  timeoutOverrideMs?: number,
): Promise<ProviderSafetyDecision> {
  const chatRequest = buildOpenRouterSafetyRequest(input, model);
  const timeoutMs = resolveTimeoutMs(timeoutOverrideMs);
  let lastError: unknown;

  for (let attempt = 1; attempt <= OPENROUTER_SAFETY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await send(chatRequest, timeoutMs);

      return parseProviderSafetyDecision(response);
    } catch (error) {
      if (error instanceof ProviderSafetyError) {
        throw error;
      }

      lastError = error;

      if (attempt < OPENROUTER_SAFETY_MAX_ATTEMPTS && isRetryableOpenRouterError(error)) {
        await new Promise((resolve) => setTimeout(resolve, OPENROUTER_SAFETY_RETRY_DELAY_MS));
        continue;
      }

      throw toProviderSafetyError(error);
    }
  }

  throw toProviderSafetyError(lastError);
}

function isRetryableOpenRouterError(error: unknown) {
  return error instanceof OpenRouterChatError && OPENROUTER_SAFETY_RETRYABLE_CATEGORIES.has(error.category);
}

function toProviderSafetyError(error: unknown) {
  if (error instanceof OpenRouterChatError) {
    return new ProviderSafetyError(error.category);
  }

  return new ProviderSafetyError("provider_unavailable");
}

export const configuredSafetyProvider = {
  classify: classifySessionSafetyWithAiProvider,
} satisfies SessionSafetyProvider;

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
    ...buildSafetyTemperatureParameter(model),
    ...buildSafetyReasoningParameter(model),
    maxCompletionTokens: resolveSafetyMaxCompletionTokens(model),
    stream: false,
    provider: getOpenRouterPrivateProviderPreferences(model),
    responseFormat: {
      type: "json_schema",
      jsonSchema: OPENROUTER_SAFETY_RESPONSE_SCHEMA,
    },
  };
}

function resolveSafetyModel(modelOverride?: string) {
  return resolveOpenRouterModel(modelOverride ?? getOpenRouterEnv().safetyModel, OPENROUTER_SAFETY_DEFAULT_MODEL);
}

function buildSafetyTemperatureParameter(model: string): Pick<OpenRouterSafetyRequestBody, "temperature"> {
  if (OPENAI_NO_TEMPERATURE_MODEL_PATTERN.test(model.trim())) {
    return {};
  }

  return {
    temperature: OPENROUTER_SAFETY_TEMPERATURE,
  };
}

function buildSafetyReasoningParameter(model: string): Pick<OpenRouterSafetyRequestBody, "reasoning"> {
  if (!usesSafetyMinimalReasoning(model)) {
    return {};
  }

  return {
    reasoning: {
      effort: "minimal",
    },
  };
}

function resolveSafetyMaxCompletionTokens(model: string) {
  return usesSafetyMinimalReasoning(model)
    ? OPENROUTER_SAFETY_REASONING_MAX_COMPLETION_TOKENS
    : OPENROUTER_SAFETY_MAX_COMPLETION_TOKENS;
}

function usesSafetyMinimalReasoning(model: string) {
  return OPENAI_GPT_5_6_LUNA_MODEL_PATTERN.test(model.trim());
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_SAFETY_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}
