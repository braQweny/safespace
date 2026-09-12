import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOpenAiChatRequest, sendOpenAiChat } from "../chat";
import { resolveOpenAiModel } from "../model";
import type { OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";

const request: OpenRouterNonStreamingChatRequest = {
  model: "openai/gpt-5.6-luna",
  messages: [{ role: "user", content: "Synthetic input." }],
  maxCompletionTokens: 16_000,
  reasoning: { effort: "xhigh" },
  provider: { dataCollection: "deny", zdr: true, requireParameters: true },
};
const completion = {
  id: "test",
  created: 1,
  object: "chat.completion",
  model: "gpt-5.6-luna",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Synthetic answer." } }],
};
afterEach(() => {
  vi.useRealTimers();
});

describe("native OpenAI chat adapter", () => {
  it("translates only supported fields while preserving reasoning and strict JSON property names", () => {
    const body = buildOpenAiChatRequest({
      ...request,
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "test",
          strict: true,
          schema: {
            type: "object",
            properties: { reasonCode: { type: "string" } },
            required: ["reasonCode"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(body).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning_effort: "xhigh",
      max_completion_tokens: 16_000,
      store: false,
      stream: false,
    });
    expect(body.response_format?.json_schema).toMatchObject({ strict: true, schema: { required: ["reasonCode"] } });
    expect(body).not.toHaveProperty("provider");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("temperature");
    expect(
      buildOpenAiChatRequest({ ...request, reasoning: { effort: "minimal" }, maxCompletionTokens: 256 }),
    ).toMatchObject({ reasoning_effort: "low", max_completion_tokens: 1_024 });
    expect(
      buildOpenAiChatRequest({ ...request, model: "openai/gpt-4o-mini", reasoning: undefined, temperature: 0.2 }),
    ).toMatchObject({ temperature: 0.2 });
  });

  it("accepts native model ids and rejects router-only model ids without a request", async () => {
    expect(resolveOpenAiModel(" gpt-5.6-luna ")).toBe("gpt-5.6-luna");
    for (const model of ["google/gemini-3.7-flash", "openai/gpt-5.6-luna:batch", ""]) {
      const fetcher = vi.fn();
      await expect(
        sendOpenAiChat({ apiKey: "test", chatRequest: { ...request, model }, fetcher }),
      ).rejects.toMatchObject({ category: "missing_configuration" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("normalizes a native response without requiring deprecated system_fingerprint", async () => {
    const fetcher = vi.fn(() => Promise.resolve(Response.json(completion)));
    const result = await sendOpenAiChat({ apiKey: "test", chatRequest: request, fetcher });
    expect(result.choices[0]).toMatchObject({ finishReason: "stop", message: { content: "Synthetic answer." } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 303, 307, 308])("rejects redirect %s using the Workers-compatible manual mode", async (status) => {
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const outbound = new Request(input);
      expect(outbound.redirect).toBe("manual");
      expect(outbound.url).toBe("https://api.openai.com/v1/chat/completions");
      return Promise.resolve(new Response(null, { status, headers: { Location: "https://example.com/redirect" } }));
    });
    await expect(sendOpenAiChat({ apiKey: "test", chatRequest: request, fetcher })).rejects.toMatchObject({
      category: "provider_unavailable",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, "invalid_provider_response"],
    [401, "provider_unavailable"],
    [429, "provider_rate_limited"],
    [500, "provider_unavailable"],
    [504, "provider_timeout"],
  ])("maps HTTP %s without leaking private errors or retrying", async (status, category) => {
    const fetcher = vi.fn(() =>
      Promise.resolve(Response.json({ error: { message: "PRIVATE CONTENT", code: "PRIVATE KEY" } }, { status })),
    );
    let thrown: unknown;
    try {
      await sendOpenAiChat({ apiKey: "test", chatRequest: request, fetcher });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ category });
    expect(String(thrown)).not.toContain("PRIVATE");
    expect(JSON.stringify(thrown)).not.toContain("PRIVATE");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["length", "content_filter", "tool_calls", null, "unknown"])(
    "rejects an incomplete finish %s",
    async (finishReason) => {
      await expect(
        sendOpenAiChat({
          apiKey: "test",
          chatRequest: request,
          fetcher: () =>
            Promise.resolve(
              Response.json({ ...completion, choices: [{ ...completion.choices[0], finish_reason: finishReason }] }),
            ),
        }),
      ).rejects.toMatchObject({ category: "invalid_provider_response" });
    },
  );

  it.each([
    { error: { message: "private" } },
    { choices: [] },
    null,
    {
      ...completion,
      choices: [{ ...completion.choices[0], message: { role: "assistant", content: null, refusal: "Refused" } }],
    },
  ])("rejects malformed/error/refusal envelopes", async (payload) => {
    await expect(
      sendOpenAiChat({ apiKey: "test", chatRequest: request, fetcher: () => Promise.resolve(Response.json(payload)) }),
    ).rejects.toMatchObject({ category: "invalid_provider_response" });
  });

  it("aborts the request at the deadline and reports only a timeout category", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (input: RequestInfo | URL) =>
        new Promise<Response>((_resolve, reject) => {
          new Request(input).signal.addEventListener("abort", () => {
            reject(new DOMException("private upstream text", "AbortError"));
          });
        }),
    );
    const pending = sendOpenAiChat({ apiKey: "test", chatRequest: request, timeoutMs: 20, fetcher });
    const assertion = expect(pending).rejects.toMatchObject({ category: "provider_timeout" });
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
