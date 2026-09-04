import { describe, expect, it } from "vitest";
import { getOpenRouterPrivateProviderPreferences } from "../privacy";

describe("private OpenRouter routing", () => {
  it("prefers the available Luna endpoint without relaxing privacy or disabling failover", () => {
    expect(getOpenRouterPrivateProviderPreferences(" openai/gpt-5.6-luna ")).toEqual({
      dataCollection: "deny",
      requireParameters: true,
      zdr: true,
      order: ["azure/eu"],
      allowFallbacks: true,
    });
  });

  it.each(["openai/gpt-4o-mini", "google/gemini-3.7-flash", "openai/gpt-5.6-luna-pro"])(
    "does not restrict %s to an unverified endpoint",
    (model) => {
      expect(getOpenRouterPrivateProviderPreferences(model)).toEqual({
        dataCollection: "deny",
        requireParameters: true,
        zdr: true,
      });
    },
  );
});
