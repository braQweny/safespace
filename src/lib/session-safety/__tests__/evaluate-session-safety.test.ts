import { describe, expect, it, vi } from "vitest";
import { evaluateSessionSafety } from "../evaluate-session-safety";
import { ProviderSafetyError, type ProviderSafetyDecision, type SessionSafetyProvider } from "../provider";
import type { SessionSafetyInput } from "../types";

vi.mock("../openrouter-classifier", () => ({
  configuredSafetyProvider: {
    classify: vi.fn(),
  },
}));

const input: SessionSafetyInput = {
  currentUserMessage: "Potrzebuje uporzadkowac mysli przed trudna rozmowa.",
};

function createProvider(decision: ProviderSafetyDecision): SessionSafetyProvider {
  const classify = vi.fn(() => Promise.resolve(decision));

  return {
    classify,
  };
}

function createFailingProvider(error: Error): SessionSafetyProvider {
  const classify = vi.fn(() => Promise.reject(error));

  return {
    classify,
  };
}

describe("evaluateSessionSafety", () => {
  it("maps normal risk to ordinary simulation allow", async () => {
    const classify = vi.fn(() =>
      Promise.resolve({
        risk: "normal",
        action: "allow",
        reasonCode: "none_detected",
      } satisfies ProviderSafetyDecision),
    );
    const provider = {
      classify,
    } satisfies SessionSafetyProvider;

    const decision = await evaluateSessionSafety(input, { provider });

    expect(decision).toEqual({
      risk: "normal",
      action: "allow",
      reasonCode: "none_detected",
      copy: null,
      constraints: [],
      crisisResources: [],
    });
    expect(classify).toHaveBeenCalledWith(input);
  });

  it("maps caution risk to constrained continuation without a hard-stop", async () => {
    const provider = createProvider({
      risk: "caution",
      action: "allow_with_constraints",
      reasonCode: "ambiguous_distress",
    });

    const decision = await evaluateSessionSafety(input, { provider });

    expect(decision.risk).toBe("caution");
    expect(decision.action).toBe("allow_with_constraints");
    expect(decision.copy).toBeNull();
    expect(decision.crisisResources).toEqual([]);
    expect(decision.constraints.map((constraint) => constraint.id)).toEqual([
      "avoid_diagnosis",
      "avoid_risk_increasing_instructions",
      "avoid_prescriptive_treatment_claims",
      "supportive_non_clinical_language",
    ]);
    expect(decision.constraints.map((constraint) => constraint.id)).not.toContain("include_escalation_boundary");
  });

  it("maps crisis risk to hard-stop resources instead of ordinary simulation", async () => {
    const provider = createProvider({
      risk: "crisis",
      action: "hard_stop",
      reasonCode: "immediate_danger_signal",
    });

    const decision = await evaluateSessionSafety(input, { provider });

    expect(decision.risk).toBe("crisis");
    expect(decision.action).toBe("hard_stop");
    expect(decision.reasonCode).toBe("immediate_danger_signal");
    expect(decision.constraints).toEqual([]);
    expect(decision.crisisResources.map((resource) => resource.id)).toEqual(["pl", "us", "local_fallback"]);
  });

  it.each([
    ["missing configuration", new ProviderSafetyError("missing_configuration"), "missing_configuration"],
    ["parser failure", new ProviderSafetyError("invalid_provider_response"), "invalid_provider_response"],
    ["provider unavailable", new ProviderSafetyError("provider_unavailable"), "provider_unavailable"],
    ["provider timeout", new ProviderSafetyError("provider_timeout"), "provider_timeout"],
    ["provider rate limit", new ProviderSafetyError("provider_rate_limited"), "provider_rate_limited"],
    ["network failure", new Error("network failure"), "provider_unavailable"],
  ] as const)("fails closed when the provider reports %s", async (_name, error, reasonCode) => {
    const decision = await evaluateSessionSafety(input, { provider: createFailingProvider(error) });

    expect(decision.risk).toBe("crisis");
    expect(decision.action).toBe("hard_stop");
    expect(decision.reasonCode).toBe(reasonCode);
    expect(decision.copy?.title).toBe("We can't safely start the simulation right now");
    expect(decision.crisisResources.map((resource) => resource.id)).toEqual(["pl", "us", "local_fallback"]);
  });
});
