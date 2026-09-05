import { describe, expect, it, vi } from "vitest";
import { SessionTranscriptionError } from "../errors";
import { buildOpenRouterTranscriptionRequest, transcribeSessionAudioWithOpenRouter } from "../openrouter-transcription";

vi.mock("@/lib/session-transcription/env", () => ({
  getOpenRouterTranscriptionConfig: () => ({
    apiKey: undefined,
    model: "openai/gpt-4o-mini-transcribe",
  }),
  resolveTranscriptionModel: (modelOverride?: string | null) => {
    const trimmedModel = modelOverride?.trim();

    return trimmedModel && trimmedModel.length > 0 ? trimmedModel : "openai/gpt-4o-mini-transcribe";
  },
}));

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
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

function expectSessionTranscriptionError(error: unknown, category: SessionTranscriptionError["category"]) {
  expect(error).toBeInstanceOf(SessionTranscriptionError);
  expect((error as SessionTranscriptionError).category).toBe(category);
}

function readOpenRouterRequest(fetcher: ReturnType<typeof vi.fn>) {
  expect(fetcher).toHaveBeenCalledOnce();

  const firstCall = fetcher.mock.calls[0] as [string, RequestInit] | undefined;
  const url = firstCall?.[0];
  const init = firstCall?.[1];

  if (typeof url !== "string" || !init) {
    throw new Error("Expected fetcher to receive URL and RequestInit");
  }

  if (typeof init.body !== "string") {
    throw new Error("Expected fetcher body to be a JSON string");
  }

  return {
    url,
    init,
    body: JSON.parse(init.body) as Record<string, unknown>,
  };
}

describe("buildOpenRouterTranscriptionRequest", () => {
  it("builds a Polish deterministic WebM transcription request", () => {
    expect(
      buildOpenRouterTranscriptionRequest(
        {
          audioBase64: "UklGRg==",
          format: "webm",
          language: "pl",
        },
        "openai/gpt-4o-mini-transcribe",
      ),
    ).toEqual({
      model: "openai/gpt-4o-mini-transcribe",
      input_audio: {
        data: "UklGRg==",
        format: "webm",
      },
      language: "pl",
      temperature: 0,
    });
  });

  it("sends the language of the interface, not a fixed Polish", () => {
    expect(
      buildOpenRouterTranscriptionRequest(
        { audioBase64: "UklGRg==", format: "webm", language: "en" },
        "openai/gpt-4o-mini-transcribe",
      ),
    ).toMatchObject({ language: "en" });
  });
});

describe("transcribeSessionAudioWithOpenRouter", () => {
  it("uses supplied server configuration and parses only transcription text plus safe metadata", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse({
          text: " To jest podyktowana wiadomość. ",
          model: "openai/gpt-4o-mini-transcribe",
          usage: {
            cost: 0.001,
          },
        }),
      ),
    );

    const response = await transcribeSessionAudioWithOpenRouter(
      {
        audioBase64: "UklGRg==",
        format: "webm",
        language: "pl",
      },
      {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as typeof fetch,
      },
    );

    expect(response).toEqual({
      text: "To jest podyktowana wiadomość.",
      providerMetadata: {
        provider: "openrouter",
        model: "openai/gpt-4o-mini-transcribe",
      },
    });

    const { url, init, body } = readOpenRouterRequest(fetcher);
    expect(url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-openrouter-key");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(body).toMatchObject({
      model: "openai/gpt-4o-mini-transcribe",
      language: "pl",
      temperature: 0,
      input_audio: {
        format: "webm",
      },
    });
  });

  it("requires server-side OpenRouter configuration", async () => {
    await expect(
      transcribeSessionAudioWithOpenRouter({
        audioBase64: "UklGRg==",
        format: "webm",
        language: "pl",
      }),
    ).rejects.toMatchObject({
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
      await transcribeSessionAudioWithOpenRouter(
        {
          audioBase64: "UklGRg==",
          format: "webm",
          language: "pl",
        },
        {
          apiKey: "test-openrouter-key",
          fetcher: fetcher as unknown as typeof fetch,
        },
      );
    } catch (error) {
      expectSessionTranscriptionError(error, category);
      expect(String(error)).not.toContain("raw provider error");
      expect(fetcher).toHaveBeenCalledOnce();
      return;
    }

    throw new Error("Expected transcription provider error");
  });

  it("rejects invalid provider response shapes", async () => {
    const fetcher = vi.fn(() => Promise.resolve(createJsonResponse({ text: "" })));

    await expect(
      transcribeSessionAudioWithOpenRouter(
        {
          audioBase64: "UklGRg==",
          format: "webm",
          language: "pl",
        },
        {
          apiKey: "test-openrouter-key",
          fetcher: fetcher as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("maps aborts to provider timeouts and other fetch failures to provider unavailable", async () => {
    const abortedFetcher = vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError")));
    const failingFetcher = vi.fn(() => Promise.reject(new Error("network failed")));

    await expect(
      transcribeSessionAudioWithOpenRouter(
        {
          audioBase64: "UklGRg==",
          format: "webm",
          language: "pl",
        },
        {
          apiKey: "test-openrouter-key",
          fetcher: abortedFetcher as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      category: "provider_timeout",
    });

    await expect(
      transcribeSessionAudioWithOpenRouter(
        {
          audioBase64: "UklGRg==",
          format: "webm",
          language: "pl",
        },
        {
          apiKey: "test-openrouter-key",
          fetcher: failingFetcher as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});
