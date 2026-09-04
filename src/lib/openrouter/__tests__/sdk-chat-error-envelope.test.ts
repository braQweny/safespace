import { describe, expect, it, vi } from "vitest";
import { OpenRouterChatError, sendOpenRouterChat } from "../sdk-chat";

// Exercise the real SDK parser: mocking chat.send hides HTTP-200 error envelopes.
describe("OpenRouter errors inside HTTP 200 responses", () => {
  it.each([
    [429, "provider_rate_limited"],
    [408, "provider_timeout"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [400, "invalid_provider_response"],
    [422, "invalid_provider_response"],
  ])("maps embedded status %i to %s without exposing the provider payload", async (code, category) => {
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json({ error: { code, message: "private provider text", metadata: { raw: "private payload" } } }),
      ),
    );

    const error: unknown = await sendOpenRouterChat({
      apiKey: "test-key",
      chatRequest: { model: "test-model", messages: [{ role: "user", content: "test" }], stream: false },
      fetcher,
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenRouterChatError);
    expect(error).toMatchObject({ category, message: category });
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain("private");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    "null",
    JSON.stringify({ error: null }),
    JSON.stringify({ error: { code: "429" } }),
    JSON.stringify({ error: { code: 200 } }),
    JSON.stringify({ error: { code: 429.5 } }),
    JSON.stringify({ error: { code: 600 } }),
    JSON.stringify({ choices: [] }),
  ])("keeps malformed responses classified as invalid: %s", async (body) => {
    await expect(
      sendOpenRouterChat({
        apiKey: "test-key",
        chatRequest: { model: "test-model", messages: [{ role: "user", content: "test" }], stream: false },
        fetcher: () => Promise.resolve(new Response(body, { headers: { "Content-Type": "application/json" } })),
      }),
    ).rejects.toMatchObject({ category: "invalid_provider_response" });
  });
});
