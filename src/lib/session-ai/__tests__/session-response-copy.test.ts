import { describe, expect, it } from "vitest";
import { SESSION_AI_ERROR_CATEGORIES } from "../errors";
import { getSafetyBoundaryUnavailableCopy, getSessionAiFailureCopy } from "../session-response-copy";

describe("getSessionAiFailureCopy", () => {
  it("provides stable Polish retry copy for every ordinary AI failure category", () => {
    for (const category of SESSION_AI_ERROR_CATEGORIES) {
      const copy = getSessionAiFailureCopy(category);

      expect(copy.title).not.toContain("OpenRouter");
      expect(copy.body).not.toContain("payload");
      expect(copy.retryLabel).toBe("Spróbuj ponownie");
    }
  });
});

describe("getSafetyBoundaryUnavailableCopy", () => {
  it.each([
    ["provider_rate_limited", "ogranicza liczbę zapytań"],
    ["provider_timeout", "trwało zbyt długo"],
    ["provider_unavailable", "chwilowo niedostępne"],
  ] as const)("explains safety %s and preserves the draft", (category, explanation) => {
    const copy = getSafetyBoundaryUnavailableCopy(category);
    expect(copy.body).toContain(explanation);
    expect(copy.body).toContain("Treść zostaje w polu");
    expect(copy.body).toContain("nie została dodana do rozmowy");
  });
});
