import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BadRequestResponseError,
  OpenRouterError,
  RequestAbortedError,
  RequestTimeoutError,
  RequestTimeoutResponseError,
  ResponseValidationError,
  SDKValidationError,
  TooManyRequestsResponseError,
  UnprocessableEntityResponseError,
} from "@openrouter/sdk/models/errors";
import type { OpenRouterChatErrorCategory, OpenRouterNonStreamingChatRequest } from "@/lib/openrouter/sdk-chat";

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}));

vi.mock("@openrouter/sdk", () => {
  class HTTPClient {
    readonly init: unknown;

    constructor(init: unknown) {
      this.init = init;
    }
  }

  class OpenRouter {
    readonly chat = { send: sendMock };
  }

  return { HTTPClient, OpenRouter };
});

const { sendOpenRouterChat } = await import("@/lib/openrouter/sdk-chat");

const chatRequest = {
  model: "test-model",
  messages: [
    {
      role: "user",
      content: "ping",
    },
  ],
} as OpenRouterNonStreamingChatRequest;

function createHttpMeta(status: number) {
  return {
    response: new Response("{}", { status }),
    request: new Request("https://openrouter.test/api/v1/chat"),
    body: "{}",
  };
}

function createStatusError(status: number) {
  return new OpenRouterError("provider error", createHttpMeta(status));
}

async function expectCategory(thrown: unknown, category: OpenRouterChatErrorCategory) {
  sendMock.mockRejectedValueOnce(thrown);

  await expect(sendOpenRouterChat({ apiKey: "test-key", chatRequest })).rejects.toMatchObject({
    name: "OpenRouterChatError",
    category,
  });
}

describe("sendOpenRouterChat configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing API key before contacting the provider", async () => {
    await expect(sendOpenRouterChat({ chatRequest })).rejects.toMatchObject({
      name: "OpenRouterChatError",
      category: "missing_configuration",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only API key before contacting the provider", async () => {
    await expect(sendOpenRouterChat({ apiKey: "   ", chatRequest })).rejects.toMatchObject({
      name: "OpenRouterChatError",
      category: "missing_configuration",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns the provider result and disables SDK retries", async () => {
    const chatResult = { id: "gen-1", choices: [] };
    sendMock.mockResolvedValueOnce(chatResult);

    const result = await sendOpenRouterChat({
      apiKey: "test-key",
      chatRequest,
      timeoutMs: 5_000,
    });

    expect(result).toBe(chatResult);
    expect(sendMock).toHaveBeenCalledWith(
      { chatRequest: { ...chatRequest, stream: false } },
      {
        timeoutMs: 5_000,
        retries: { strategy: "none" },
      },
    );
  });

  it("omits the timeout option when no timeout is provided", async () => {
    sendMock.mockResolvedValueOnce({ id: "gen-2", choices: [] });

    await sendOpenRouterChat({ apiKey: "test-key", chatRequest });

    expect(sendMock).toHaveBeenCalledWith(
      { chatRequest: { ...chatRequest, stream: false } },
      {
        retries: { strategy: "none" },
      },
    );
  });
});

describe("sendOpenRouterChat error mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps client-side timeout and abort errors to provider_timeout", async () => {
    await expectCategory(new RequestTimeoutError("timed out"), "provider_timeout");
    await expectCategory(new RequestAbortedError("aborted"), "provider_timeout");
  });

  it("maps a provider timeout response to provider_timeout", async () => {
    const data = { error: { message: "timeout" } } as unknown as ConstructorParameters<
      typeof RequestTimeoutResponseError
    >[0];
    await expectCategory(new RequestTimeoutResponseError(data, createHttpMeta(408)), "provider_timeout");
  });

  it("maps rate limit responses to provider_rate_limited", async () => {
    const data = { error: { message: "rate limited" } } as unknown as ConstructorParameters<
      typeof TooManyRequestsResponseError
    >[0];
    await expectCategory(new TooManyRequestsResponseError(data, createHttpMeta(429)), "provider_rate_limited");
  });

  it("maps validation and malformed-request errors to invalid_provider_response", async () => {
    await expectCategory(new SDKValidationError("invalid payload", new Error("zod"), {}), "invalid_provider_response");
    await expectCategory(
      new ResponseValidationError("invalid response", {
        ...createHttpMeta(200),
        cause: new Error("zod"),
        rawValue: {},
        rawMessage: "invalid",
      }),
      "invalid_provider_response",
    );

    const badRequest = { error: { message: "bad request" } } as unknown as ConstructorParameters<
      typeof BadRequestResponseError
    >[0];
    await expectCategory(new BadRequestResponseError(badRequest, createHttpMeta(400)), "invalid_provider_response");

    const unprocessable = { error: { message: "unprocessable" } } as unknown as ConstructorParameters<
      typeof UnprocessableEntityResponseError
    >[0];
    await expectCategory(
      new UnprocessableEntityResponseError(unprocessable, createHttpMeta(422)),
      "invalid_provider_response",
    );
  });

  it("maps generic provider responses by HTTP status", async () => {
    await expectCategory(createStatusError(408), "provider_timeout");
    await expectCategory(createStatusError(429), "provider_rate_limited");
    await expectCategory(createStatusError(400), "invalid_provider_response");
    await expectCategory(createStatusError(422), "invalid_provider_response");
    await expectCategory(createStatusError(500), "provider_unavailable");
    await expectCategory(createStatusError(503), "provider_unavailable");
  });

  it("maps unknown failures to provider_unavailable", async () => {
    await expectCategory(new Error("connection reset"), "provider_unavailable");
    await expectCategory("string failure", "provider_unavailable");
  });
});
