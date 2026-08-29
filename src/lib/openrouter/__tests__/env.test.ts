import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_SAFETY_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_SESSION_MODEL: "google/gemini-3.7-flash",
  OPENROUTER_SESSION_REASONING_EFFORT: " XHigh ",
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

const { getOpenRouterEnv, parseOpenRouterReasoningEffort } = await import("../env");

describe("getOpenRouterEnv", () => {
  it("falls back to the session model when no summary override is set", () => {
    expect(getOpenRouterEnv().summaryModel).toBe("google/gemini-3.7-flash");
  });

  it("normalizes the configured session reasoning effort", () => {
    expect(getOpenRouterEnv().sessionReasoningEffort).toBe("xhigh");
  });

  it("keeps every model resolvable to a non-empty id", () => {
    const env = getOpenRouterEnv();

    for (const model of [env.sessionModel, env.safetyModel, env.summaryModel, env.transcriptionModel]) {
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

describe("parseOpenRouterReasoningEffort", () => {
  it("accepts OpenRouter's effort scale case-insensitively", () => {
    for (const effort of ["minimal", "low", "medium", "high", "xhigh"]) {
      expect(parseOpenRouterReasoningEffort(effort)).toBe(effort);
      expect(parseOpenRouterReasoningEffort(effort.toUpperCase())).toBe(effort);
    }
  });

  it("treats unknown or empty values as not configured instead of passing them through", () => {
    // With requireParameters an unknown effort would route nowhere and every turn would fail closed.
    for (const value of ["ultra", "extra-high", "", "   ", undefined, null]) {
      expect(parseOpenRouterReasoningEffort(value)).toBeUndefined();
    }
  });
});
