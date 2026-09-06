import { describe, expect, it, vi } from "vitest";
import { SessionSummaryError } from "../errors";
import { buildOpenRouterPeopleMemoryRequest, generatePeopleMemoryWithOpenRouter } from "../openrouter-people-memory";
import type { GeneratePeopleMemoryInput } from "../people-memory-types";

vi.mock("@/lib/session-summary/env", () => ({
  getOpenRouterSummaryConfig: () => ({ apiKey: undefined, model: "openai/gpt-4o-mini" }),
  resolveSummaryModel: (modelOverride?: string | null) => {
    const trimmedModel = modelOverride?.trim();
    return trimmedModel && trimmedModel.length > 0 ? trimmedModel : "openai/gpt-4o-mini";
  },
}));

const input: GeneratePeopleMemoryInput = {
  locale: "pl",
  avatarFirstName: "Marek",
  persons: [
    {
      ref: 1,
      name: "Marta",
      nameLocked: false,
      relation: "koleżanka z pracy",
      relationLocked: false,
      facts: [{ ref: 1, kind: "account", text: "Skomentowała pomysł.", userEdited: false }],
    },
  ],
  forgottenPeople: [],
  messages: [
    { role: "user", content: "Marta z pracy znowu to zrobiła, a kuzynka Marta pomogła.", conversationIndex: 1 },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function completion(content: string, finishReason = "stop") {
  return {
    id: "chatcmpl-people",
    created: 1_735_000_000,
    object: "chat.completion",
    model: "openai/gpt-4o-mini",
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", content } }],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 },
  };
}

const validChanges = {
  newPersons: [
    { name: "Marta", relation: "kuzynka", facts: [{ kind: "who", text: "Pomogła.", conversationIndex: 1 }] },
  ],
  updates: [
    {
      personRef: 1,
      relation: null,
      addFacts: [{ kind: "account", text: "Znowu skomentowała.", conversationIndex: 1 }],
      replaceFacts: [],
      removeFactRefs: [],
      mentionedInConversations: [1],
    },
  ],
  newDifficulties: [],
  difficultyUpdates: [],
  incomplete: false,
};

describe("buildOpenRouterPeopleMemoryRequest", () => {
  it("asks for strict JSON with generous output room and the private provider policy", () => {
    const request = buildOpenRouterPeopleMemoryRequest(input, "openai/gpt-4o-mini");
    expect(request.responseFormat.type).toBe("json_schema");
    expect(request.responseFormat.jsonSchema).toMatchObject({ name: "safespace_people_memory_changes", strict: true });
    expect(request.maxTokens).toBe(8000);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.temperature).toBe(0.2);
    expect(request.stream).toBe(false);
    expect(request.provider).toMatchObject({ dataCollection: "deny", requireParameters: true, zdr: true });
    expect(request.messages[0].role).toBe("system");
    expect(request.messages[1].content).toContain("kuzynka Marta");
  });

  it("gives the Luna family low reasoning, the EU route and max_completion_tokens without temperature", () => {
    const request = buildOpenRouterPeopleMemoryRequest(input, "openai/gpt-5.6-luna");
    expect(request.reasoning).toEqual({ effort: "low" });
    expect(request.maxCompletionTokens).toBe(8000);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request).not.toHaveProperty("temperature");
    expect(request.provider).toEqual({
      dataCollection: "deny",
      requireParameters: true,
      zdr: true,
      order: ["azure/eu"],
      allowFallbacks: true,
    });
  });
});

describe("generatePeopleMemoryWithOpenRouter", () => {
  it("parses a valid change set and reports usage without leaking provider text", async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(completion(JSON.stringify(validChanges)))));
    const response = await generatePeopleMemoryWithOpenRouter(input, { apiKey: "key", fetcher: fetcher });
    expect(response.changes.newPersons).toHaveLength(1);
    expect(response.changes.updates[0].personRef).toBe(1);
    expect(response.providerMetadata).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      usage: { promptTokens: 900, completionTokens: 120 },
    });
    const sent = (await (fetcher.mock.calls[0] as unknown as [Request])[0].clone().json()) as Record<string, unknown>;
    expect(sent.response_format).toMatchObject({ type: "json_schema" });
  });

  it.each([
    ["length", "invalid_provider_response"],
    ["content_filter", "invalid_provider_response"],
  ])("rejects a %s finish as %s", async (finishReason, category) => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(completion(JSON.stringify(validChanges), finishReason))));
    await expect(generatePeopleMemoryWithOpenRouter(input, { apiKey: "key", fetcher: fetcher })).rejects.toMatchObject({
      category,
    });
  });

  it("maps provider failures to stable categories and requires configuration", async () => {
    const rateLimited = vi.fn(() => Promise.resolve(jsonResponse({ error: { code: 429, message: "raw" } }, 429)));
    await expect(
      generatePeopleMemoryWithOpenRouter(input, { apiKey: "key", fetcher: rateLimited }),
    ).rejects.toMatchObject({ category: "provider_rate_limited" });
    const malformed = vi.fn(() => Promise.resolve(jsonResponse(completion("not json"))));
    await expect(
      generatePeopleMemoryWithOpenRouter(input, { apiKey: "key", fetcher: malformed }),
    ).rejects.toBeInstanceOf(SessionSummaryError);
    await expect(generatePeopleMemoryWithOpenRouter(input, { fetcher: malformed })).rejects.toMatchObject({
      category: "missing_configuration",
    });
  });
});
