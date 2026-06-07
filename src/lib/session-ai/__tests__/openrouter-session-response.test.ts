import { describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES } from "../../modalities";
import { SessionAiError } from "../errors";
import { buildOpenRouterSessionRequest, generateSessionResponseWithOpenRouter } from "../openrouter-session-response";
import type { GenerateSessionResponseInput } from "../types";

vi.mock("../env", () => ({
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
  currentUserMessage: "Potrzebuje uporzadkowac mysli.",
  modality: {
    modalityName: "Podejscie integracyjne",
    avatarName: "Iga, przewodniczka laczaca watki",
    sessionStyleHint:
      "Elastycznie dobiera pytania do tematu, jasno nazywa wybrana perspektywe i nie miesza kilku kierunkow naraz bez potrzeby.",
  },
} satisfies GenerateSessionResponseInput;

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function expectSessionAiError(error: unknown, category: SessionAiError["category"]) {
  expect(error).toBeInstanceOf(SessionAiError);
  expect((error as SessionAiError).category).toBe(category);
}

describe("buildOpenRouterSessionRequest", () => {
  it("builds a conservative non-streaming chat request", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-4o-mini");

    expect(request.model).toBe("openai/gpt-4o-mini");
    expect(request.stream).toBe(false);
    expect(request.temperature).toBeLessThanOrEqual(0.4);
    expect(request.max_tokens).toBeLessThanOrEqual(420);
    expect(request).not.toHaveProperty("max_completion_tokens");
    expect(request.provider.require_parameters).toBe(true);
    expect(request.messages[0]?.role).toBe("system");
    expect(request.messages.at(-1)?.content).toContain(input.currentUserMessage);
  });

  it("uses max_tokens for Gemini session models routed through OpenRouter", () => {
    const request = buildOpenRouterSessionRequest(input, "google/gemini-3.1-flash-lite");

    expect(request.model).toBe("google/gemini-3.1-flash-lite");
    expect(request.max_tokens).toBeLessThanOrEqual(420);
    expect(request).not.toHaveProperty("max_completion_tokens");
    expect(request.reasoning).toEqual({
      effort: "low",
      exclude: true,
    });
    expect(request.provider.require_parameters).toBe(true);
  });

  it("includes the selected catalog sessionStyleHint in the final provider message", () => {
    const modality = MVP_MODALITIES.find((item) => item.avatarId === "integrative-guide");

    expect(modality).toBeDefined();

    if (!modality) {
      return;
    }

    const request = buildOpenRouterSessionRequest(
      {
        currentUserMessage: "Mam wrażenie, że wszystko się we mnie miesza.",
        modality: {
          modalityName: modality.modalityName,
          avatarName: modality.avatarName,
          sessionStyleHint: modality.sessionStyleHint,
        },
        recentMessages: [
          {
            role: "user",
            content: "Wcześniejsza wiadomość.",
            sequenceIndex: 0,
          },
        ],
        locale: "pl",
      },
      "openai/gpt-4o-mini",
    );

    expect(request.messages[0]).toMatchObject({
      role: "system",
    });
    expect(request.messages.at(-1)).toMatchObject({
      role: "user",
    });
    expect(request.messages.at(-1)?.content).toContain("Avatar: Iga");
    expect(request.messages.at(-1)?.content).toContain("przewodniczka łącząca wątki");
    expect(request.messages.at(-1)?.content).toContain("Typical reply shape");
    expect(request.messages.at(-1)?.content).toContain("Mam wrażenie, że wszystko się we mnie miesza.");
  });

  it("omits temperature for OpenAI GPT-5 session models that reject sampling parameters", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.4-mini");

    expect(request.model).toBe("openai/gpt-5.4-mini");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    expect(request.max_completion_tokens).toBeLessThanOrEqual(420);
    expect(request).not.toHaveProperty("max_tokens");
    expect(request).not.toHaveProperty("reasoning");
    expect(request.provider.require_parameters).toBe(true);
  });
});

describe("generateSessionResponseWithOpenRouter", () => {
  it("uses the supplied API key/model and parses only assistant text plus safe metadata", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "Mozemy zaczac od spokojnego nazwania faktow i interpretacji.",
              },
            },
          ],
          model: "openai/gpt-4o-mini",
          usage: {
            prompt_tokens: 42,
            completion_tokens: 18,
            total_tokens: 60,
          },
        }),
      ),
    );

    const response = await generateSessionResponseWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(response).toEqual({
      assistantText: "Mozemy zaczac od spokojnego nazwania faktow i interpretacji.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        finishReason: "stop",
        usage: {
          promptTokens: 42,
          completionTokens: 18,
          totalTokens: 60,
        },
      },
    });

    expect(fetcher).toHaveBeenCalledOnce();
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
    await expect(generateSessionResponseWithOpenRouter(input, { apiKey: "" })).rejects.toMatchObject({
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
      await generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as typeof fetch,
      });
    } catch (error) {
      expectSessionAiError(error, category);
      return;
    }

    throw new Error("Expected session AI error");
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
      generateSessionResponseWithOpenRouter(input, {
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
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: abortedFetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      category: "provider_timeout",
    });

    await expect(
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: failingFetcher as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});
