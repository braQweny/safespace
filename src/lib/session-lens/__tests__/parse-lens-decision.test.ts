import { describe, expect, it } from "vitest";
import { parseProviderLensDecision, parseProviderLensDecisionObject } from "../parse-lens-decision";
import { SessionLensProviderError } from "../types";

function response(content: string, extra: Record<string, unknown> = {}, choice: Record<string, unknown> = {}) {
  return {
    id: "chatcmpl-lens",
    model: "openai/gpt-4o-mini",
    choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content }, ...choice }],
    ...extra,
  };
}

describe("parseProviderLensDecision", () => {
  it("accepts every catalog lens and none, with the provider's unit counts", () => {
    expect(parseProviderLensDecision(response('{"lens":"work_burnout"}'))).toEqual({ lens: "work_burnout" });
    expect(parseProviderLensDecision(response('{"lens":"none"}'))).toEqual({ lens: "none" });
    expect(
      parseProviderLensDecision(
        response('{"lens":"anxiety_avoidance"}', { usage: { promptTokens: 120.4, completionTokens: 4 } }),
      ),
    ).toEqual({ lens: "anxiety_avoidance", usage: { promptTokens: 120, completionTokens: 4 } });
    expect(
      parseProviderLensDecision(
        response('{"lens":"family_of_origin"}', { usage: { prompt_tokens: 7, completion_tokens: -1 } }),
      ),
    ).toEqual({ lens: "family_of_origin", usage: { promptTokens: 7 } });
  });

  it.each([
    ["an unknown label", response('{"lens":"grief"}')],
    ["an extra key", response('{"lens":"none","note":"x"}')],
    ["a missing key", response("{}")],
    ["non-JSON content", response("work_burnout")],
    ["an array", response('["none"]')],
    ["empty content", response("   ")],
    ["no choices", { choices: [] }],
    ["a truncated reply", response('{"lens":"none"}', {}, { finishReason: "length" })],
    ["a filtered reply", response('{"lens":"none"}', {}, { finish_reason: "content_filter" })],
    ["a non-object body", "nope"],
  ])("rejects %s as invalid_provider_response", (_label, body) => {
    expect(() => parseProviderLensDecision(body)).toThrow(SessionLensProviderError);
    try {
      parseProviderLensDecision(body);
    } catch (error) {
      expect((error as SessionLensProviderError).category).toBe("invalid_provider_response");
    }
  });

  it("parses a decoded object with the same closed rules", () => {
    expect(parseProviderLensDecisionObject({ lens: "none" })).toBe("none");
    expect(() => parseProviderLensDecisionObject({ lens: "none", risk: "normal" })).toThrow(SessionLensProviderError);
  });
});
