import type { Fetcher } from "@openrouter/sdk";
import { describe, expect, it, vi } from "vitest";
import { evaluateSessionSafety } from "../evaluate-session-safety";
import { buildOpenRouterSafetyRequest, classifySessionSafetyWithOpenRouter } from "../openrouter-classifier";
import { ProviderSafetyError } from "../provider";
import type { SessionSafetyInput } from "../types";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_SAFETY_MODEL: "openai/gpt-4o-mini",
  OPENROUTER_SESSION_MODEL: undefined,
  OPENROUTER_SESSION_REASONING_EFFORT: undefined,
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

const input = {
  currentUserMessage: "Potrzebuje uporzadkowac mysli przed trudna rozmowa.",
} satisfies SessionSafetyInput;

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createChatCompletionResponse(content: string) {
  return {
    id: "chatcmpl-safety-test",
    created: 1_735_000_000,
    object: "chat.completion",
    model: "openai/gpt-4o-mini",
    system_fingerprint: null,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content,
        },
      },
    ],
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

describe("buildOpenRouterSafetyRequest", () => {
  it("builds an SDK typed structured-output safety request", () => {
    const request = buildOpenRouterSafetyRequest(input, "openai/gpt-4o-mini");

    expect(request).toMatchObject({
      model: "openai/gpt-4o-mini",
      temperature: 0,
      maxCompletionTokens: 64,
      stream: false,
      provider: {
        dataCollection: "deny",
        requireParameters: true,
        zdr: true,
      },
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "safespace_session_safety_decision",
          strict: true,
        },
      },
    });
    expect(request.responseFormat.jsonSchema.schema.properties.risk.enum).toEqual(["normal", "caution", "crisis"]);
    expect(request.responseFormat.jsonSchema.schema.properties.action.enum).toEqual([
      "allow",
      "allow_with_constraints",
      "hard_stop",
    ]);
    expect(request.messages[0].role).toBe("system");
    expect(request.messages.at(-1)?.content).toContain(input.currentUserMessage);
    expect(request).not.toHaveProperty("reasoning");
  });

  it("uses minimal reasoning, no temperature and a larger token cap for GPT-5.6 Luna variants", () => {
    for (const model of ["openai/gpt-5.6-luna", "openai/gpt-5.6-luna:batch", "openai/gpt-5.6-luna-pro"]) {
      const request = buildOpenRouterSafetyRequest(input, model);

      expect(request.model).toBe(model);
      expect(request).not.toHaveProperty("temperature");
      expect(request.reasoning).toEqual({
        effort: "minimal",
      });
      expect(request.maxCompletionTokens).toBe(256);
    }
  });

  it("omits temperature for other OpenAI gpt-5/o-series safety models without forcing reasoning", () => {
    const request = buildOpenRouterSafetyRequest(input, "openai/gpt-5.6-terra");

    expect(request).not.toHaveProperty("temperature");
    expect(request).not.toHaveProperty("reasoning");
    expect(request.maxCompletionTokens).toBe(64);
  });
});

describe("classifySessionSafetyWithOpenRouter", () => {
  it("uses SDK chat.send with structured output and parses a valid decision", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse(
            JSON.stringify({
              risk: "normal",
              action: "allow",
              reasonCode: "none_detected",
            }),
          ),
        ),
      ),
    );

    const decision = await classifySessionSafetyWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-4o-mini",
      fetcher: fetcher as unknown as Fetcher,
    });

    expect(decision).toEqual({
      risk: "normal",
      action: "allow",
      reasonCode: "none_detected",
    });

    const { request, body } = await readOpenRouterRequest(fetcher);
    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.headers.get("authorization")).toBe("Bearer test-openrouter-key");
    expect(body).toMatchObject({
      model: "openai/gpt-4o-mini",
      max_completion_tokens: 64,
      stream: false,
      provider: {
        data_collection: "deny",
        require_parameters: true,
        zdr: true,
      },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "safespace_session_safety_decision",
          strict: true,
        },
      },
    });
  });

  it("sends the minimal-reasoning Luna request shape over the wire", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse(
            JSON.stringify({
              risk: "normal",
              action: "allow",
              reasonCode: "none_detected",
            }),
          ),
        ),
      ),
    );

    await classifySessionSafetyWithOpenRouter(input, {
      apiKey: "test-openrouter-key",
      model: "openai/gpt-5.6-luna",
      fetcher: fetcher as unknown as Fetcher,
    });

    const { body } = await readOpenRouterRequest(fetcher);
    expect(body).toMatchObject({
      model: "openai/gpt-5.6-luna",
      max_completion_tokens: 256,
      reasoning: {
        effort: "minimal",
      },
    });
    expect(body).not.toHaveProperty("temperature");
  });

  it("requires server-side OpenRouter configuration", async () => {
    await expect(classifySessionSafetyWithOpenRouter(input, { apiKey: "" })).rejects.toMatchObject({
      category: "missing_configuration",
    });
  });

  it("maps invalid provider decisions to invalid_provider_response", async () => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        createJsonResponse(
          createChatCompletionResponse(
            JSON.stringify({
              risk: "normal",
              action: "hard_stop",
              reasonCode: "none_detected",
            }),
          ),
        ),
      ),
    );

    await expect(
      classifySessionSafetyWithOpenRouter(input, {
        apiKey: "test-openrouter-key",
        fetcher: fetcher as unknown as Fetcher,
      }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("keeps evaluateSessionSafety fail-closed for provider transport failures", async () => {
    const fetcher = vi.fn(() => Promise.resolve(createOpenRouterErrorResponse(503)));

    const decision = await evaluateSessionSafety(input, {
      provider: {
        classify(value) {
          return classifySessionSafetyWithOpenRouter(value, {
            apiKey: "test-openrouter-key",
            fetcher: fetcher as unknown as Fetcher,
          });
        },
      },
    });

    expect(decision.risk).toBe("crisis");
    expect(decision.action).toBe("hard_stop");
    expect(decision.reasonCode).toBe("provider_unavailable");
    expect(String(new ProviderSafetyError("provider_unavailable"))).not.toContain("raw provider error");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
