import type { Fetcher } from "@openrouter/sdk";
import { getOpenRouterSummaryConfig, resolveSummaryModel } from "./env";
import {
  buildOpenRouterReasoningParameter,
  buildOpenRouterTokenLimitParameter,
  supportsOpenRouterTemperature,
} from "@/lib/session-ai/openrouter-request-params";
import type { OpenRouterReasoningEffort } from "@/lib/openrouter/env";
import { OpenRouterChatError, sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";
import {
  getOpenRouterPrivateProviderPreferences,
  type OpenRouterPrivateProviderPreferences,
} from "@/lib/openrouter/privacy";
import { SessionSummaryError } from "./errors";
import { resolveSummaryMaxCompletionTokens, resolveSummaryReasoningEffort } from "./openrouter-summary";
import { buildSummaryProviderMetadata } from "./provider-response";
import { buildPeopleMemoryMessages } from "./people-memory-prompt";
import { OPENROUTER_PEOPLE_MEMORY_RESPONSE_SCHEMA } from "./people-memory-schema";
import { parsePeopleMemoryChanges } from "./parse-people-memory-changes";
import type { GeneratePeopleMemoryInput, PeopleMemoryRefIndex, PeopleMemoryResponse } from "./people-memory-types";
import type { SessionSummaryPromptMessage } from "./types";

// Jak podsumowanie z rozumowaniem: nic w budżecie sesji nie ogranicza tej
// generacji, a partia z wieloma osobami potrzebuje miejsca na cały JSON.
const OPENROUTER_PEOPLE_MEMORY_TIMEOUT_MS = 25_000;
// Odpowiedź może liczyć kilkadziesiąt faktów; poniżej tego progu model z
// ukrytym rozumowaniem wracał z `finish_reason: "length"` i deterministyczną pętlą ponowień.
const OPENROUTER_PEOPLE_MEMORY_MIN_COMPLETION_TOKENS = 6_000;
const OPENROUTER_PEOPLE_MEMORY_TEMPERATURE = 0.2;

interface OpenRouterPeopleMemoryOptions {
  apiKey?: string;
  model?: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

type OpenRouterPeopleMemoryRequestBody = OpenRouterNonStreamingChatRequest & {
  model: string;
  messages: SessionSummaryPromptMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  maxTokens?: number;
  reasoning?: {
    effort: OpenRouterReasoningEffort;
  };
  stream: false;
  provider: OpenRouterPrivateProviderPreferences;
  responseFormat: {
    type: "json_schema";
    jsonSchema: typeof OPENROUTER_PEOPLE_MEMORY_RESPONSE_SCHEMA;
  };
};

export async function generatePeopleMemoryWithOpenRouter(
  input: GeneratePeopleMemoryInput,
  options: OpenRouterPeopleMemoryOptions = {},
): Promise<PeopleMemoryResponse> {
  const config = getOpenRouterSummaryConfig();
  const apiKey = options.apiKey ?? config.apiKey;
  const model = resolveSummaryModel(options.model ?? config.model);

  try {
    const response = await sendOpenRouterChat({
      apiKey,
      chatRequest: buildOpenRouterPeopleMemoryRequest(input, model),
      fetcher: options.fetcher,
      timeoutMs: resolveTimeoutMs(options.timeoutMs),
    });

    return {
      changes: parsePeopleMemoryChanges(response, buildPeopleMemoryRefIndex(input)),
      providerMetadata: buildSummaryProviderMetadata(response, model),
    };
  } catch (error) {
    if (error instanceof SessionSummaryError) {
      throw error;
    }

    if (error instanceof OpenRouterChatError) {
      throw new SessionSummaryError(error.category);
    }

    throw new SessionSummaryError("provider_unavailable");
  }
}

export function buildOpenRouterPeopleMemoryRequest(
  input: GeneratePeopleMemoryInput,
  model: string,
): OpenRouterPeopleMemoryRequestBody {
  return {
    model,
    messages: [...buildPeopleMemoryMessages(input)],
    ...(supportsOpenRouterTemperature(model) ? { temperature: OPENROUTER_PEOPLE_MEMORY_TEMPERATURE } : {}),
    ...buildOpenRouterReasoningParameter(model, resolveSummaryReasoningEffort(model)),
    ...buildOpenRouterTokenLimitParameter(
      model,
      Math.max(OPENROUTER_PEOPLE_MEMORY_MIN_COMPLETION_TOKENS, resolveSummaryMaxCompletionTokens(model)),
    ),
    stream: false,
    provider: getOpenRouterPrivateProviderPreferences(model),
    responseFormat: {
      type: "json_schema",
      jsonSchema: OPENROUTER_PEOPLE_MEMORY_RESPONSE_SCHEMA,
    },
  };
}

/** Refy, które parser uznaje za znane, wynikają wprost z wejścia promptu. */
export function buildPeopleMemoryRefIndex(input: GeneratePeopleMemoryInput): PeopleMemoryRefIndex {
  return {
    personRefs: new Set(input.persons.map((person) => person.ref)),
    factRefsByPerson: new Map(
      input.persons.map((person) => [person.ref, new Set(person.facts.map((fact) => fact.ref))]),
    ),
    conversationCount: input.messages.reduce((count, message) => Math.max(count, message.conversationIndex ?? 0), 0),
  };
}

function resolveTimeoutMs(timeoutMs: number | undefined) {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return OPENROUTER_PEOPLE_MEMORY_TIMEOUT_MS;
  }

  return Math.round(timeoutMs);
}
