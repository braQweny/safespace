import type { Fetcher } from "@openrouter/sdk";
import { describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES } from "../../modalities";
import { SessionAiError } from "../errors";
import { buildOpenRouterSessionRequest, generateSessionResponseWithOpenRouter } from "../openrouter-session-response";
import type { GenerateSessionResponseInput } from "../types";
import { getModalityPromptNames } from "@/lib/modality-copy";

const sessionConfig = vi.hoisted(() => ({
  apiKey: undefined,
  model: "openai/gpt-4o-mini",
  reasoningEffort: undefined as "xhigh" | undefined,
}));

vi.mock("../env", () => ({
  getOpenRouterSessionConfig: () => sessionConfig,
  resolveSessionModel: (modelOverride?: string | null) => {
    const trimmedModel = modelOverride?.trim();

    return trimmedModel && trimmedModel.length > 0 ? trimmedModel : "openai/gpt-4o-mini";
  },
}));

const input = {
  locale: "pl",
  currentUserMessage: "Potrzebuje uporzadkowac mysli.",
  modality: {
    modalityName: "Podejście integracyjne",
    avatarName: "Iga, przewodniczka łącząca wątki",
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
    id: "chatcmpl-test",
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

function expectSessionAiError(error: unknown, category: SessionAiError["category"]) {
  expect(error).toBeInstanceOf(SessionAiError);
  expect((error as SessionAiError).category).toBe(category);
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

describe("buildOpenRouterSessionRequest", () => {
  it("builds a bounded non-streaming chat request with conversational sampling", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-4o-mini");

    expect(request.model).toBe("openai/gpt-4o-mini");
    expect(request.stream).toBe(false);
    expect(request.temperature).toBe(0.7);
    expect(request.maxTokens).toBe(800);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.provider.requireParameters).toBe(true);
    expect(request.provider.dataCollection).toBe("deny");
    expect(request.provider.zdr).toBe(true);
    expect(request.messages[0].role).toBe("system");
    expect(request.messages.at(-1)?.content).toContain(input.currentUserMessage);
  });

  it("uses max_tokens for Gemini session models routed through OpenRouter", () => {
    const request = buildOpenRouterSessionRequest(input, "google/gemini-3.1-flash-lite");

    expect(request.model).toBe("google/gemini-3.1-flash-lite");
    expect(request.maxTokens).toBe(800);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("uses medium reasoning and a larger token limit for Gemini 3.5 Flash", () => {
    const request = buildOpenRouterSessionRequest(input, "google/gemini-3.5-flash");

    expect(request.model).toBe("google/gemini-3.5-flash");
    expect(request.maxTokens).toBe(1600);
    expect(request).not.toHaveProperty("maxCompletionTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("uses medium reasoning, temperature and a larger token limit for Gemini 3.7 Flash, including the batch variant", () => {
    for (const model of ["google/gemini-3.7-flash", "google/gemini-3.7-flash:batch"]) {
      const request = buildOpenRouterSessionRequest(input, model);

      expect(request.model).toBe(model);
      expect(request.temperature).toBe(0.7);
      expect(request.maxTokens).toBe(1600);
      expect(request).not.toHaveProperty("maxCompletionTokens");
      expect(request.reasoning).toEqual({
        effort: "medium",
      });
      expect(request.provider.requireParameters).toBe(true);
    }
  });

  it("gives Ox Alpha room for hidden reasoning and keeps max_tokens plus temperature", () => {
    for (const model of ["stealth/ox-alpha", "stealth/ox-alpha:free"]) {
      const request = buildOpenRouterSessionRequest(input, model);

      expect(request.model).toBe(model);
      expect(request.temperature).toBe(0.7);
      // Model rozumuje przed odpowiedzią — zbyt mały budżet wraca jako
      // `finish_reason: "length"` i cała odpowiedź jest odrzucana.
      expect(request.maxTokens).toBe(2400);
      expect(request).not.toHaveProperty("maxCompletionTokens");
      expect(request.reasoning).toEqual({
        effort: "medium",
      });
      expect(request.provider.requireParameters).toBe(true);
    }
  });

  it("includes the selected catalog sessionStyleHint in the system message and keeps the user turn plain", () => {
    const modality = MVP_MODALITIES.find((item) => item.avatarId === "integrative-guide");

    expect(modality).toBeDefined();

    if (!modality) {
      return;
    }

    const request = buildOpenRouterSessionRequest(
      {
        currentUserMessage: "Mam wrażenie, że wszystko się we mnie miesza.",
        modality: {
          ...getModalityPromptNames(modality.modalityId),
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
    expect(request.messages[0].content).toContain("Avatar: Iga");
    expect(request.messages[0].content).toContain("guide who connects the threads");
    expect(request.messages[0].content).toContain("Reply shapes");
    expect(request.messages.at(-1)).toMatchObject({
      role: "user",
    });
    expect(request.messages.at(-1)?.content).toBe("Mam wrażenie, że wszystko się we mnie miesza.");
    expect(request.messages.at(-1)?.content).not.toContain("Avatar: Iga");
  });

  it("omits temperature for OpenAI GPT-5 session models that reject sampling parameters", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.4-mini");

    expect(request.model).toBe("openai/gpt-5.4-mini");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    expect(request.maxCompletionTokens).toBe(800);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request).not.toHaveProperty("reasoning");
    expect(request.provider.requireParameters).toBe(true);
  });

  it("uses medium reasoning for OpenAI GPT-5.5 session responses", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.5");

    expect(request.model).toBe("openai/gpt-5.5");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    expect(request.maxCompletionTokens).toBe(800);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("uses medium reasoning for OpenAI GPT-5.6 Luna Pro session responses, including the batch variant", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.6-luna-pro:batch");

    expect(request.model).toBe("openai/gpt-5.6-luna-pro:batch");
    expect(request).not.toHaveProperty("temperature");
    expect(request.stream).toBe(false);
    // Hidden reasoning shares the completion budget, so the plain chat cap
    // would come back as finish_reason "length".
    expect(request.maxCompletionTokens).toBe(2_400);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request.provider.requireParameters).toBe(true);
  });

  it("pins GPT-5.6 Luna to medium reasoning with room for hidden thinking without a configured effort", () => {
    // The whole Luna family reasons; leaving the provider's default in place
    // made the hidden-token budget unpredictable and the 800-token chat cap
    // truncated replies. The classifier, session and summary paths now agree.
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.6-luna");

    expect(request.model).toBe("openai/gpt-5.6-luna");
    expect(request.reasoning).toEqual({
      effort: "medium",
    });
    expect(request).not.toHaveProperty("temperature");
    expect(request.maxCompletionTokens).toBe(2_400);
    expect(request).not.toHaveProperty("maxTokens");
  });

  it("applies the configured extra-high effort with a budget that fits hidden thinking", () => {
    const request = buildOpenRouterSessionRequest(input, "openai/gpt-5.6-luna", { reasoningEffort: "xhigh" });

    expect(request.reasoning).toEqual({
      effort: "xhigh",
    });
    // Hidden reasoning bills against the same cap as the visible reply; a chat-sized
    // budget would come back as finish_reason "length" and fail the whole turn.
    expect(request.maxCompletionTokens).toBe(16_000);
    expect(request).not.toHaveProperty("maxTokens");
    expect(request).not.toHaveProperty("temperature");
    expect(request.provider.requireParameters).toBe(true);
  });

  it("lets the configured effort override a model's default effort and budget", () => {
    const request = buildOpenRouterSessionRequest(input, "stealth/ox-alpha", { reasoningEffort: "high" });

    expect(request.reasoning).toEqual({
      effort: "high",
    });
    expect(request.maxTokens).toBe(6_000);
    expect(request).not.toHaveProperty("maxCompletionTokens");
  });

  it("keeps a model's own budget for efforts below high", () => {
    const request = buildOpenRouterSessionRequest(input, "stealth/ox-alpha", { reasoningEffort: "low" });

    expect(request.reasoning).toEqual({
      effort: "low",
    });
    expect(request.maxTokens).toBe(2_400);
  });
});

describe("generateSessionResponseWithOpenRouter", () => {
  it("uses the supplied API key/model and parses only assistant text plus safe metadata", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse("Mozemy zaczac od spokojnego nazwania faktow i interpretacji.", {
            model: "openai/gpt-4o-mini",
            finishReason: "stop",
            usage: {
              promptTokens: 42,
              completionTokens: 18,
              totalTokens: 60,
            },
          }),
        ),
      ),
    );

    const response = await generateSessionResponseWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      fetcher: fetcher as unknown as Fetcher,
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

    const { request, body } = await readOpenRouterRequest(fetcher);
    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer test-openrouter-key");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(body).toMatchObject({
      model: "openai/gpt-4o-mini",
      stream: false,
      provider: {
        data_collection: "deny",
        require_parameters: true,
        zdr: true,
      },
    });
    expect(body).toHaveProperty("max_tokens");
  });

  it("requires server-side OpenRouter configuration", async () => {
    await expect(generateSessionResponseWithOpenRouter(input, { apiKey: "" })).rejects.toMatchObject({
      category: "missing_configuration",
    });
  });

  it("uses light reasoning for the opening and configured xhigh for conversation turns", async () => {
    sessionConfig.reasoningEffort = "xhigh";
    try {
      for (const mode of ["opening", "reply"] as const) {
        const fetcher = vi.fn(() =>
          Promise.resolve(createJsonResponse(createChatCompletionResponse("Możemy zacząć."))),
        );
        await generateSessionResponseWithOpenRouter(
          { ...input, mode: mode === "opening" ? "opening" : undefined, avatarMemory: "Ważny wcześniejszy fakt." },
          { apiKey: "test-key", model: "openai/gpt-5.6-luna", fetcher },
        );
        const { body } = await readOpenRouterRequest(fetcher);
        expect(body.reasoning).toEqual({ effort: mode === "opening" ? "low" : "xhigh" });
        expect(body.max_completion_tokens).toBe(mode === "opening" ? 2400 : 16000);
        expect(JSON.stringify(body.messages)).toContain("Ważny wcześniejszy fakt.");
      }
    } finally {
      sessionConfig.reasoningEffort = undefined;
    }
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
      await generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      });
    } catch (error) {
      expectSessionAiError(error, category);
      expect(String(error)).not.toContain("raw provider error");
      expect(fetcher).toHaveBeenCalledTimes(status === 429 || status === 503 ? 2 : 1);
      return;
    }

    throw new Error("Expected session AI error");
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
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("recovers a rate-limited turn after one delayed retry", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(createJsonResponse({ error: { code: 429, message: "provider busy" } }))
        .mockResolvedValueOnce(createJsonResponse(createChatCompletionResponse("Odpowiedź po ponowieniu.")));
      const result = generateSessionResponseWithOpenRouter(input, { apiKey: "test-key", fetcher });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetcher).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(499);
      expect(fetcher).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toMatchObject({ assistantText: "Odpowiedź po ponowieniu." });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the delayed retry inside the original response deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
    // Node's native AbortSignal.timeout does not use Vitest's fake timers.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => {
        controller.abort();
      }, ms);
      return controller.signal;
    });
    try {
      let retrySignal: AbortSignal | undefined;
      const fetcher = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) =>
              setTimeout(() => {
                resolve(createOpenRouterErrorResponse(503));
              }, 400),
            ),
        )
        .mockImplementationOnce(
          (request: Request) =>
            new Promise<Response>((_resolve, reject) => {
              retrySignal = request.signal;
              request.signal.addEventListener("abort", () => {
                reject(new DOMException("aborted", "AbortError"));
              });
            }),
        );
      const result = generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-key",
        fetcher,
        timeoutMs: 1_200,
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(900);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(retrySignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(retrySignal?.aborted).toBe(true);
      expect(await result).toMatchObject({ category: "provider_timeout" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not retry when the remaining budget cannot fit the retry delay", async () => {
    const fetcher = vi.fn(() => Promise.resolve(createOpenRouterErrorResponse(429)));
    await expect(
      generateSessionResponseWithOpenRouter(input, { apiKey: "test-key", fetcher, timeoutMs: 100 }),
    ).rejects.toMatchObject({ category: "provider_rate_limited" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects length-finished responses instead of persisting truncated assistant text", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse("To wyglada jak odpowiedz urwana w polowie zdania", {
            model: "google/gemini-3.1-flash-lite",
            finishReason: "length",
          }),
        ),
      ),
    );

    await expect(
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        model: "google/gemini-3.1-flash-lite",
        fetcher: fetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("rejects content-filtered responses like the summary path instead of persisting partial text", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse("Fragment przed odcieciem przez filtr", {
            model: "openai/gpt-4o-mini",
            finishReason: "content_filter",
          }),
        ),
      ),
    );

    await expect(
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        model: "openai/gpt-4o-mini",
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
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: abortedFetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "provider_timeout",
    });

    await expect(
      generateSessionResponseWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: failingFetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});
