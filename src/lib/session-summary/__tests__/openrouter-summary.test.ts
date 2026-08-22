import type { Fetcher } from "@openrouter/sdk";
import { describe, expect, it, vi } from "vitest";
import { SessionSummaryError } from "../errors";
import { buildOpenRouterSummaryRequest, generateSessionSummaryWithOpenRouter } from "../openrouter-summary";
import type { GenerateSessionSummaryInput } from "../types";

vi.mock("@/lib/session-summary/env", () => ({
  getOpenRouterSummaryConfig: () => ({
    apiKey: undefined,
    model: "openai/gpt-4o-mini",
  }),
  resolveSummaryModel: (modelOverride?: string | null) => {
    const trimmedModel = modelOverride?.trim();

    return trimmedModel && trimmedModel.length > 0 ? trimmedModel : "openai/gpt-4o-mini";
  },
}));

const input = {
  locale: "pl",
  messages: [
    {
      role: "user",
      content: "Czuje napiecie przed rozmowa w pracy.",
      sequenceIndex: 0,
    },
    {
      role: "assistant",
      content: "Zatrzymajmy sie przy tym, co jest w tej rozmowie najtrudniejsze.",
      sequenceIndex: 1,
    },
  ],
} satisfies GenerateSessionSummaryInput;

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createChatCompletionResponse(
  content: string,
  options: {
    model?: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  } = {},
) {
  return {
    id: "chatcmpl-summary-test",
    created: 1_735_000_000,
    object: "chat.completion",
    model: options.model ?? "openai/gpt-4o-mini",
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        finish_reason: options.finishReason ?? "stop",
        message: {
          role: "assistant",
          content,
        },
      },
    ],
    ...(options.usage
      ? {
          usage: {
            prompt_tokens: options.usage.promptTokens,
            completion_tokens: options.usage.completionTokens,
            total_tokens: options.usage.totalTokens,
          },
        }
      : {}),
  };
}

function createOpenRouterErrorResponse(status: number) {
  return createJsonResponse(
    {
      error: {
        code: status,
        message: "raw provider error",
      },
    },
    status,
  );
}

function expectSessionSummaryError(error: unknown, category: SessionSummaryError["category"]) {
  expect(error).toBeInstanceOf(SessionSummaryError);
  expect((error as SessionSummaryError).category).toBe(category);
}

async function readOpenRouterRequest(fetcher: ReturnType<typeof vi.fn>) {
  expect(fetcher).toHaveBeenCalledOnce();

  const firstCall = fetcher.mock.calls[0] as [Request] | undefined;
  const request = firstCall?.[0];
  expect(request).toBeInstanceOf(Request);

  if (!(request instanceof Request)) {
    throw new Error("Expected SDK fetcher to receive a Request");
  }

  return {
    request,
    body: (await request.clone().json()) as Record<string, unknown>,
  };
}

describe("buildOpenRouterSummaryRequest", () => {
  it("builds a conservative non-streaming summary request", () => {
    const request = buildOpenRouterSummaryRequest(input, "openai/gpt-4o-mini");

    expect(request.model).toBe("openai/gpt-4o-mini");
    expect(request.stream).toBe(false);
    expect(request.temperature).toBeLessThanOrEqual(0.2);
    expect(request.maxTokens).toBeLessThanOrEqual(320);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.provider.requireParameters).toBe(true);
    expect(request.messages[0].role).toBe("system");
    expect(request.messages.at(-1)?.content).toContain("Czuje napiecie");
  });

  it("uses max_tokens for Gemini summary models routed through OpenRouter", () => {
    const request = buildOpenRouterSummaryRequest(input, "google/gemini-3.1-flash-lite");

    expect(request.model).toBe("google/gemini-3.1-flash-lite");
    expect(request.maxTokens).toBeLessThanOrEqual(320);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.provider.requireParameters).toBe(true);
  });

  it("uses medium reasoning and a larger token limit for Gemini 3.5 Flash summaries", () => {
    const request = buildOpenRouterSummaryRequest(input, "google/gemini-3.5-flash");

    expect(request.model).toBe("google/gemini-3.5-flash");
    expect(request.maxTokens).toBe(800);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("gives Gemini 3.7 Flash summaries room for hidden reasoning plus the summary itself", () => {
    // Regression: at 320 tokens the model spent the whole budget thinking and
    // returned finish_reason "length", so every summary was rejected.
    for (const model of ["google/gemini-3.7-flash", "google/gemini-3.7-flash:batch"]) {
      const request = buildOpenRouterSummaryRequest(input, model);

      expect(request.model).toBe(model);
      expect(request.maxTokens).toBe(1600);
      expect(request).not.toHaveProperty("maxCompletionTokens");
      expect(request.reasoning).toEqual({
        effort: "medium",
      });
      expect(request.provider.requireParameters).toBe(true);
    }
  });

  it("gives Ox Alpha summaries the same reasoning headroom as the session path", () => {
    // Podsumowania spadają na model sesyjny, gdy nie ma własnego override,
    // więc oba budżety muszą być aktualizowane razem.
    const request = buildOpenRouterSummaryRequest(input, "stealth/ox-alpha");

    expect(request.maxTokens).toBe(2400);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("omits temperature for OpenAI GPT-5 summary models that reject sampling parameters", () => {
    const request = buildOpenRouterSummaryRequest(input, "openai/gpt-5.4-mini");

    expect(request.model).toBe("openai/gpt-5.4-mini");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    expect(request.maxCompletionTokens).toBeLessThanOrEqual(320);
    expect(request).not.toHaveProperty("maxTokens");
  });

  it("uses medium reasoning for OpenAI GPT-5.5 summaries", () => {
    const request = buildOpenRouterSummaryRequest(input, "openai/gpt-5.5");

    expect(request.model).toBe("openai/gpt-5.5");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    expect(request.maxCompletionTokens).toBeLessThanOrEqual(320);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
  });
});

describe("generateSessionSummaryWithOpenRouter", () => {
  it("uses supplied server configuration and parses only summary text plus safe metadata", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse(
            "Uzytkownik wracal do napiecia przed rozmowa w pracy i potrzeby spokojnego uporzadkowania.",
            {
              model: "openai/gpt-4o-mini",
              finishReason: "stop",
              usage: {
                promptTokens: 50,
                completionTokens: 20,
                totalTokens: 70,
              },
            },
          ),
        ),
      ),
    );

    const response = await generateSessionSummaryWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      fetcher: fetcher as unknown as Fetcher,
    });

    expect(response).toEqual({
      summaryText: "Uzytkownik wracal do napiecia przed rozmowa w pracy i potrzeby spokojnego uporzadkowania.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        finishReason: "stop",
        usage: {
          promptTokens: 50,
          completionTokens: 20,
          totalTokens: 70,
        },
      },
    });

    const { request, body } = await readOpenRouterRequest(fetcher);
    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer test-openrouter-key");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(body).toMatchObject({
      model: "openai/gpt-4o-mini",
      stream: false,
      provider: {
        require_parameters: true,
      },
    });
    expect(body).toHaveProperty("max_tokens");
  });

  it("requires server-side OpenRouter configuration", async () => {
    await expect(generateSessionSummaryWithOpenRouter(input, { apiKey: "" })).rejects.toMatchObject({
      category: "missing_configuration",
    });
  });

  it.each([
    [408, "provider_timeout"],
    [429, "provider_rate_limited"],
    [503, "provider_unavailable"],
    [400, "invalid_provider_response"],
    [422, "invalid_provider_response"],
  ] as const)("maps HTTP %s to %s without returning raw provider bodies", async (status, category) => {
    const fetcher = vi.fn(() => Promise.resolve(createOpenRouterErrorResponse(status)));

    try {
      await generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      });
    } catch (error) {
      expectSessionSummaryError(error, category);
      expect(String(error)).not.toContain("raw provider error");
      expect(fetcher).toHaveBeenCalledOnce();
      return;
    }

    throw new Error("Expected summary provider error");
  });

  it("rejects invalid provider response shapes", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse("", {
            model: "openai/gpt-4o-mini",
            finishReason: "stop",
          }),
        ),
      ),
    );

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("rejects length-truncated summary responses instead of saving partial text", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse("Rozmowa zostala ucieta w polowie zdan", {
            model: "openai/gpt-4o-mini",
            finishReason: "length",
          }),
        ),
      ),
    );

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("maps aborts to provider timeouts and other fetch failures to provider unavailable", async () => {
    const abortedFetcher = vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const failingFetcher = vi.fn(() => Promise.reject(new Error("network failed")));

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: abortedFetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "provider_timeout",
    });

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: failingFetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});
