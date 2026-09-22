import { describe, expect, it } from "vitest";
import {
  buildChatProviderMetadata,
  parseStrictJsonObject,
  readCompleteChoiceContent,
  readFinishReason,
  readResponseModel,
  readUsage,
} from "../chat-response";

class PipelineError extends Error {}

function fail(): never {
  throw new PipelineError("invalid_provider_response");
}

function response(choice: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { model: "openai/gpt-5.6-luna", choices: [choice], ...extra };
}

function choice(content: unknown, finish: Record<string, unknown> = { finishReason: "stop" }) {
  return { index: 0, message: { role: "assistant", content }, ...finish };
}

describe("readCompleteChoiceContent", () => {
  it.each([
    ["the SDK shape", { finishReason: "stop" }],
    ["the raw wire shape", { finish_reason: "stop" }],
    ["no finish reason", {}],
    ["a null finish reason", { finishReason: null }],
    // Only the three incomplete finishes are refused; a provider-specific
    // stop reason is not guessed at.
    ["an unrecognised finish reason", { finishReason: "end_turn" }],
  ])("returns the first choice's untrimmed content with %s", (_label, finish) => {
    expect(readCompleteChoiceContent(response(choice("  Hello.  ", finish)), fail)).toBe("  Hello.  ");
  });

  it("reads only the first choice", () => {
    const body = { choices: [choice("first"), choice("second")] };

    expect(readCompleteChoiceContent(body, fail)).toBe("first");
  });

  it.each(["length", "content_filter", "tool_calls"])("rejects a %s finish in either spelling", (reason) => {
    expect(() => readCompleteChoiceContent(response(choice("{}", { finishReason: reason })), fail)).toThrow(
      PipelineError,
    );
    expect(() => readCompleteChoiceContent(response(choice("{}", { finish_reason: reason })), fail)).toThrow(
      PipelineError,
    );
  });

  it("rejects when either spelling reports an incomplete finish", () => {
    const mixed = choice("{}", { finishReason: "stop", finish_reason: "length" });

    expect(() => readCompleteChoiceContent(response(mixed), fail)).toThrow(PipelineError);
  });

  it.each([
    ["a non-object response", "not a response"],
    ["null", null],
    ["an array", [choice("x")]],
    ["missing choices", { model: "m" }],
    ["non-array choices", { choices: { 0: choice("x") } }],
    ["no choices", { choices: [] }],
    ["a non-object choice", { choices: ["x"] }],
    ["a choice without a message", { choices: [{ finishReason: "stop" }] }],
    ["a non-object message", { choices: [{ message: "x", finishReason: "stop" }] }],
    ["null content", response(choice(null))],
    ["content parts instead of text", response(choice([{ type: "text", text: "x" }]))],
    ["empty content", response(choice(""))],
    ["whitespace-only content", response(choice(" \n\t "))],
  ])("rejects %s with the caller's own error", (_label, body) => {
    expect(() => readCompleteChoiceContent(body, fail)).toThrow(PipelineError);
  });
});

describe("parseStrictJsonObject", () => {
  it("returns a JSON object, tolerating surrounding whitespace", () => {
    expect(parseStrictJsonObject(' \n{"risk":"normal"} ', fail)).toEqual({ risk: "normal" });
  });

  it.each([
    ["invalid JSON", '{"risk":'],
    ["prose around JSON", 'Sure: {"risk":"normal"}'],
    ["an array", "[1,2]"],
    ["a string", '"normal"'],
    ["a number", "1"],
    ["null", "null"],
  ])("rejects %s", (_label, content) => {
    expect(() => parseStrictJsonObject(content, fail)).toThrow(PipelineError);
  });
});

describe("readFinishReason", () => {
  it.each(["stop", "length", "content_filter", "tool_calls"])("keeps the known reason %s", (reason) => {
    expect(readFinishReason(response(choice("x", { finishReason: reason })))).toBe(reason);
  });

  it("reads the raw wire spelling", () => {
    expect(readFinishReason(response(choice("x", { finish_reason: "length" })))).toBe("length");
  });

  it("collapses any other non-blank reason to unknown", () => {
    expect(readFinishReason(response(choice("x", { finishReason: "end_turn" })))).toBe("unknown");
  });

  it.each([
    ["a blank reason", response(choice("x", { finishReason: "  " }))],
    ["a null reason", response(choice("x", { finishReason: null }))],
    ["a non-string reason", response(choice("x", { finishReason: 1 }))],
    ["no choices", { choices: [] }],
    ["a non-object response", undefined],
  ])("returns undefined for %s", (_label, body) => {
    expect(readFinishReason(body)).toBeUndefined();
  });
});

describe("readUsage", () => {
  it("reads and rounds the SDK counters", () => {
    const body = response(choice("x"), { usage: { promptTokens: 120.4, completionTokens: 30.6, totalTokens: 151 } });

    expect(readUsage(body)).toEqual({ promptTokens: 120, completionTokens: 31, totalTokens: 151 });
  });

  it("reads the raw wire counters", () => {
    const body = response(choice("x"), { usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } });

    expect(readUsage(body)).toEqual({ promptTokens: 12, completionTokens: 3, totalTokens: 15 });
  });

  it("keeps only the usable counters", () => {
    const body = response(choice("x"), { usage: { promptTokens: -1, completionTokens: 7, totalTokens: Number.NaN } });

    expect(readUsage(body)).toEqual({ completionTokens: 7 });
  });

  it.each([
    ["no usage", response(choice("x"))],
    ["a non-object usage", response(choice("x"), { usage: 12 })],
    [
      "only unusable counters",
      response(choice("x"), { usage: { promptTokens: "12", completionTokens: Infinity, totalTokens: -3 } }),
    ],
  ])("returns undefined for %s", (_label, body) => {
    expect(readUsage(body)).toBeUndefined();
  });
});

describe("readResponseModel", () => {
  it("returns the trimmed model id", () => {
    expect(readResponseModel({ model: "  gpt-5.6-luna " })).toBe("gpt-5.6-luna");
  });

  it.each([
    ["a blank model", { model: "  " }],
    ["a non-string model", { model: 5 }],
    ["no model", {}],
    ["a non-object response", null],
  ])("returns undefined for %s", (_label, body) => {
    expect(readResponseModel(body)).toBeUndefined();
  });
});

describe("buildChatProviderMetadata", () => {
  it("reports the provider, the response model, the finish reason and usage", () => {
    const body = response(choice("x"), { usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 } });

    expect(buildChatProviderMetadata(body, "fallback-model", "openai")).toEqual({
      provider: "openai",
      model: "openai/gpt-5.6-luna",
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
  });

  it("falls back to the requested model and omits what the response lacks", () => {
    const body = { model: " ", choices: [choice("x", {})] };

    expect(buildChatProviderMetadata(body, "fallback-model", "openrouter")).toEqual({
      provider: "openrouter",
      model: "fallback-model",
    });
  });
});
