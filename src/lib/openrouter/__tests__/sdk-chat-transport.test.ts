import type { Fetcher } from "@openrouter/sdk";
import { describe, expect, it, vi } from "vitest";
import { sendOpenRouterChat } from "@/lib/openrouter/sdk-chat";

const chatRequest = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "ping" }],
};

describe("sendOpenRouterChat with the real SDK transport", () => {
  it("requests JSON without streaming and returns the decoded completion", async () => {
    const fetcher = vi.fn<Fetcher>(async (input) => {
      const request = new Request(input);
      expect(request.headers.get("Accept")).toBe("application/json");
      expect(await request.json()).toMatchObject({ stream: false });
      return Response.json({
        id: "gen-test",
        created: 1_735_000_000,
        model: "test-model",
        object: "chat.completion",
        system_fingerprint: null,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "pong" } }],
      });
    });

    const result = await sendOpenRouterChat({ apiKey: "test-key", chatRequest, fetcher });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.choices[0]?.message.content).toBe("pong");
  });

  it.each([false, true])(
    "rejects an unexpected SSE response and cancels it (cleanup rejects: %s)",
    async (rejectCancel) => {
      const cancel = vi.fn(() =>
        rejectCancel ? Promise.reject(new Error("private upstream error")) : Promise.resolve(),
      );
      const body = new ReadableStream<Uint8Array>({ cancel });
      const fetcher = vi.fn(() =>
        Promise.resolve(new Response(body, { headers: { "Content-Type": "text/event-stream" } })),
      );

      await expect(sendOpenRouterChat({ apiKey: "test-key", chatRequest, fetcher })).rejects.toMatchObject({
        name: "OpenRouterChatError",
        message: "invalid_provider_response",
        category: "invalid_provider_response",
      });
      expect(fetcher).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );
});
