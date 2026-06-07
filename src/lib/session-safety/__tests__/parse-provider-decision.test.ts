import { describe, expect, it } from "vitest";
import { parseProviderSafetyDecision } from "../parse-provider-decision";
import { ProviderSafetyError, type ProviderSafetyDecision } from "../provider";

function buildProviderResponse(decision: ProviderSafetyDecision | Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(decision),
        },
      },
    ],
  };
}

function buildRawProviderResponse(content: string) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

function expectInvalidProviderResponse(action: () => unknown) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderSafetyError);
    expect((error as ProviderSafetyError).category).toBe("invalid_provider_response");
    return;
  }

  throw new Error("Expected invalid provider response");
}

describe("parseProviderSafetyDecision", () => {
  it("accepts valid normal, caution, and crisis provider outputs", () => {
    const decisions: readonly ProviderSafetyDecision[] = [
      {
        risk: "normal",
        action: "allow",
        reasonCode: "none_detected",
      },
      {
        risk: "caution",
        action: "allow_with_constraints",
        reasonCode: "ambiguous_distress",
      },
      {
        risk: "crisis",
        action: "hard_stop",
        reasonCode: "self_harm_signal",
      },
    ];

    expect(decisions.map((decision) => parseProviderSafetyDecision(buildProviderResponse(decision)))).toEqual(
      decisions,
    );
  });

  it("rejects unknown risk values", () => {
    expectInvalidProviderResponse(() =>
      parseProviderSafetyDecision(
        buildProviderResponse({
          risk: "low",
          action: "allow",
          reasonCode: "none_detected",
        }),
      ),
    );
  });

  it("rejects missing action fields", () => {
    expectInvalidProviderResponse(() =>
      parseProviderSafetyDecision(
        buildProviderResponse({
          risk: "normal",
          reasonCode: "none_detected",
        }),
      ),
    );
  });

  it("rejects unknown reason codes", () => {
    expectInvalidProviderResponse(() =>
      parseProviderSafetyDecision(
        buildProviderResponse({
          risk: "caution",
          action: "allow_with_constraints",
          reasonCode: "model_guess",
        }),
      ),
    );
  });

  it("rejects malformed JSON content", () => {
    expectInvalidProviderResponse(() => parseProviderSafetyDecision(buildRawProviderResponse("{not-json")));
  });

  it("rejects empty choices", () => {
    expectInvalidProviderResponse(() => parseProviderSafetyDecision({ choices: [] }));
  });

  it("rejects extra unsupported action values", () => {
    expectInvalidProviderResponse(() =>
      parseProviderSafetyDecision(
        buildProviderResponse({
          risk: "crisis",
          action: "continue_simulation",
          reasonCode: "self_harm_signal",
        }),
      ),
    );
  });

  it("rejects action and reason combinations that do not match the risk", () => {
    expectInvalidProviderResponse(() =>
      parseProviderSafetyDecision(
        buildProviderResponse({
          risk: "normal",
          action: "hard_stop",
          reasonCode: "self_harm_signal",
        }),
      ),
    );
  });
});
