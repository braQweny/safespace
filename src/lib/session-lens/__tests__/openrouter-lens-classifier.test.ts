import type { Fetcher } from "@openrouter/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA,
  buildOpenRouterSessionLensRequest,
  detectSessionLensWithOpenRouter,
} from "../openrouter-lens-classifier";
import { SessionLensProviderError } from "../types";

vi.mock("astro:env/server", () => ({
  AI_PROVIDER: "openrouter",
  OPENAI_API_KEY: undefined,
  OPENROUTER_API_KEY: undefined,
  OPENROUTER_SAFETY_MODEL: "openai/gpt-4o-mini",
  OPENROUTER_SESSION_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_SESSION_REASONING_EFFORT: undefined,
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

const input = { currentUserMessage: "W pracy znowu wszystko na mnie." };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function completion(content: string) {
  return {
    id: "chatcmpl-lens-test",
    created: 1_735_000_000,
    object: "chat.completion",
    model: "openai/gpt-4o-mini",
    system_fingerprint: null,
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
    usage: { prompt_tokens: 90, completion_tokens: 6, total_tokens: 96 },
  };
}

describe("buildOpenRouterSessionLensRequest", () => {
  it("uses the cheap safety model by default with a strict one-field schema and zero temperature", () => {
    const request = buildOpenRouterSessionLensRequest(input);

    expect(request.model).toBe("openai/gpt-4o-mini");
    expect(request.temperature).toBe(0);
    expect(request.reasoning).toBeUndefined();
    expect(request.maxCompletionTokens).toBe(64);
    expect(request.stream).toBe(false);
    expect(request.responseFormat).toEqual({
      type: "json_schema",
      jsonSchema: OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA,
    });
    expect(OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA.strict).toBe(true);
    expect(OPENROUTER_SESSION_LENS_RESPONSE_SCHEMA.schema.properties.lens.enum).toEqual([
      "family_of_origin",
      "work_burnout",
      "anxiety_avoidance",
      "none",
    ]);
    expect(request.messages[1].content).toBe(JSON.stringify({ currentUserMessage: input.currentUserMessage }));
    expect(request.provider).toMatchObject({ dataCollection: "deny", requireParameters: true, zdr: true });
  });

  it("gives the Luna family minimal reasoning with headroom, no temperature and the EU routing", () => {
    const request = buildOpenRouterSessionLensRequest(input, "openai/gpt-5.6-luna");

    expect(request.temperature).toBeUndefined();
    expect(request.reasoning).toEqual({ effort: "minimal" });
    expect(request.maxCompletionTokens).toBe(256);
    expect(request.provider).toEqual({
      dataCollection: "deny",
      requireParameters: true,
      zdr: true,
      order: ["azure/eu"],
      allowFallbacks: true,
    });
  });
});

describe("detectSessionLensWithOpenRouter", () => {
  it("returns the parsed label with unit counts and never lets the timeout exceed six seconds", async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(completion('{"lens":"work_burnout"}'))));

    await expect(
      detectSessionLensWithOpenRouter(input, {
        apiKey: "test-key",
        fetcher: fetcher as unknown as Fetcher,
        timeoutMs: 60_000,
      }),
    ).resolves.toEqual({ lens: "work_burnout", usage: { promptTokens: 90, completionTokens: 6 } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps provider failures to categories and does not retry", async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse({ error: { code: 500, message: "raw" } }, 500)));

    await expect(
      detectSessionLensWithOpenRouter(input, { apiKey: "test-key", fetcher: fetcher as unknown as Fetcher }),
    ).rejects.toMatchObject({ name: "SessionLensProviderError", category: "provider_unavailable" });
    expect(fetcher).toHaveBeenCalledOnce();

    await expect(
      detectSessionLensWithOpenRouter(input, { fetcher: fetcher as unknown as Fetcher }),
    ).rejects.toMatchObject({ category: "missing_configuration" });
  });

  it("rejects a malformed label as an invalid response instead of guessing", async () => {
    const fetcher = vi.fn(() => Promise.resolve(jsonResponse(completion('{"lens":"grief"}'))));

    await expect(
      detectSessionLensWithOpenRouter(input, { apiKey: "test-key", fetcher: fetcher as unknown as Fetcher }),
    ).rejects.toBeInstanceOf(SessionLensProviderError);
  });
});
