import { describe, expect, it, vi } from "vitest";

// The provider must work where astro:env/server has no values (a Durable Object alarm).
vi.mock("astro:env/server", () => ({}));

import { createOpenAiSafetyProvider } from "../openai-safety-provider";

function chatCompletion(content: unknown) {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-1",
      object: "chat.completion",
      created: 1,
      model: "gpt-5.6-luna",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("createOpenAiSafetyProvider", () => {
  it("classifies through Chat Completions with the explicit key and the prefix-stripped model", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        chatCompletion({ risk: "caution", action: "allow_with_constraints", reasonCode: "ambiguous_distress" }),
      );
    const provider = createOpenAiSafetyProvider({ apiKey: "sk-explicit", model: "openai/gpt-5.6-luna", fetcher });

    await expect(
      provider.classify({ currentUserMessage: "Nie wiem, co dalej.", recentUserMessages: [] }),
    ).resolves.toEqual({
      risk: "caution",
      action: "allow_with_constraints",
      reasonCode: "ambiguous_distress",
    });
    const request = fetcher.mock.calls[0][0] as Request;
    expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(request.headers.get("authorization")).toBe("Bearer sk-explicit");
    const body = (await request.json()) as { model: string; store: boolean; messages: { content: string }[] };
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.store).toBe(false);
    expect(body.messages[1].content).toContain("Nie wiem, co dalej.");
  });

  it("retries once after a fast provider failure and closes errors to a category", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(chatCompletion({ risk: "normal", action: "allow", reasonCode: "none_detected" }));
    const provider = createOpenAiSafetyProvider({ apiKey: "sk-explicit", model: "openai/gpt-5.6-luna", fetcher });

    await expect(provider.classify({ currentUserMessage: "Cześć" })).resolves.toMatchObject({ risk: "normal" });
    expect(fetcher).toHaveBeenCalledTimes(2);

    const broken = createOpenAiSafetyProvider({
      apiKey: "sk-explicit",
      model: "openai/gpt-5.6-luna",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 400 })),
    });
    await expect(broken.classify({ currentUserMessage: "Cześć" })).rejects.toMatchObject({
      category: "invalid_provider_response",
    });
  });

  it("refuses an OpenRouter key instead of sending it to OpenAI", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createOpenAiSafetyProvider({ apiKey: "sk-or-router", model: "openai/gpt-5.6-luna", fetcher });

    await expect(provider.classify({ currentUserMessage: "Cześć" })).rejects.toMatchObject({
      category: "missing_configuration",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
