import { describe, expect, it, vi } from "vitest";
import { SessionSummaryError } from "../errors";
import { buildOpenRouterSummaryRequest, generateSessionSummaryWithOpenRouter } from "../openrouter-summary";
import type { GenerateSessionSummaryInput } from "../types";

vi.mock("@/lib/session-ai/env", () => ({
  getOpenRouterSessionConfig: () => ({
    apiKey: undefined,
    model: "openai/gpt-4o-mini",
  }),
  resolveSessionModel: (modelOverride?: string | null) => {
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

function expectSessionSummaryError(error: unknown, category: SessionSummaryError["category"]) {
  expect(error).toBeInstanceOf(SessionSummaryError);
  expect((error as SessionSummaryError).category).toBe(category);
}

describe("buildOpenRouterSummaryRequest", () => {
  it("builds a conservative non-streaming summary request", () => {
    const request = buildOpenRouterSummaryRequest(input, "openai/gpt-4o-mini");

    expect(request.model).toBe("openai/gpt-4o-mini");
    expect(request.stream).toBe(false);
    expect(request.temperature).toBeLessThanOrEqual(0.2);
    expect(request.max_completion_tokens).toBeLessThanOrEqual(320);
    expect(request.provider.require_parameters).toBe(true);
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages.at(-1)?.content).toContain("Czuje napiecie");
  });

  it("omits temperature for OpenAI GPT-5 summary models that reject sampling parameters", () => {
    const request = buildOpenRouterSummaryRequest(input, "openai/gpt-5.4-mini");

    expect(request.model).toBe("openai/gpt-5.4-mini");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
  });
});

describe("generateSessionSummaryWithOpenRouter", () => {
  it("uses supplied server configuration and parses only summary text plus safe metadata", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "Uzytkownik wracal do napiecia przed rozmowa w pracy i potrzeby spokojnego uporzadkowania.",
              },
            },
          ],
          model: "openai/gpt-4o-mini",
          usage: {
            prompt_tokens: 50,
            completion_tokens: 20,
            total_tokens: 70,
          },
        }),
      ),
    );

    const response = await generateSessionSummaryWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      fetcher: fetcher as unknown as typeof fetch,
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

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers).toEqual({
      Authorization: "Bearer test-openrouter-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "openai/gpt-4o-mini",
      stream: false,
    });
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
    [422, "invalid_provider_response"],
  ] as const)("maps HTTP %s to %s without returning raw provider bodies", async (status, category) => {
    const fetcher = vi.fn(() => Promise.resolve(createJsonResponse({ error: "raw provider error" }, status)));

    try {
      await generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as typeof fetch,
      });
    } catch (error) {
      expectSessionSummaryError(error, category);
      expect(String(error)).not.toContain("raw provider error");
      return;
    }

    throw new Error("Expected summary provider error");
  });

  it("rejects invalid provider response shapes", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse({
          choices: [
            {
              message: {
                content: "",
              },
            },
          ],
        }),
      ),
    );

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as typeof fetch,
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
        fetcher: abortedFetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      category: "provider_timeout",
    });

    await expect(
      generateSessionSummaryWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: failingFetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});
