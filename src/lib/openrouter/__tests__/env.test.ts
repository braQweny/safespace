import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_SAFETY_MODEL: "openai/gpt-5.6-luna",
  OPENROUTER_SESSION_MODEL: "google/gemini-3.7-flash",
  OPENROUTER_SUMMARY_MODEL: undefined,
  OPENROUTER_TRANSCRIPTION_MODEL: undefined,
}));

const { getOpenRouterEnv } = await import("../env");

describe("getOpenRouterEnv", () => {
  it("falls back to the session model when no summary override is set", () => {
    expect(getOpenRouterEnv().summaryModel).toBe("google/gemini-3.7-flash");
  });

  it("keeps every model resolvable to a non-empty id", () => {
    const env = getOpenRouterEnv();

    for (const model of [env.sessionModel, env.safetyModel, env.summaryModel, env.transcriptionModel]) {
      expect(model.length).toBeGreaterThan(0);
    }
  });
});
