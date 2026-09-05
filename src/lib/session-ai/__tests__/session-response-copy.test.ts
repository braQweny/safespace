import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/i18n/locale";
import { SESSION_AI_ERROR_CATEGORIES } from "../errors";
import { getSafetyBoundaryUnavailableCopy, getSessionAiFailureCopy } from "../session-response-copy";

describe("getSessionAiFailureCopy", () => {
  it("provides stable retry copy for every ordinary AI failure category in both languages", () => {
    for (const locale of LOCALES) {
      for (const category of SESSION_AI_ERROR_CATEGORIES) {
        const copy = getSessionAiFailureCopy(category, locale);

        expect(copy.title).not.toContain("OpenRouter");
        expect(copy.body).not.toContain("payload");
        expect(copy.retryLabel).toBe(locale === "pl" ? "Spróbuj ponownie" : "Try again");
      }
    }
  });
});

describe("getSafetyBoundaryUnavailableCopy", () => {
  it.each([
    ["provider_rate_limited", "ogranicza liczbę zapytań"],
    ["provider_timeout", "trwało zbyt długo"],
    ["provider_unavailable", "chwilowo niedostępne"],
  ] as const)("explains safety %s in Polish and preserves the draft", (category, explanation) => {
    const copy = getSafetyBoundaryUnavailableCopy("pl", category);
    expect(copy.body).toContain(explanation);
    expect(copy.body).toContain("Treść zostaje w polu");
    expect(copy.body).toContain("nie została dodana do rozmowy");
  });

  it.each([
    ["provider_rate_limited", "limiting the number of requests"],
    ["provider_timeout", "took too long"],
    ["provider_unavailable", "temporarily unavailable"],
  ] as const)("explains safety %s in English and preserves the draft", (category, explanation) => {
    const copy = getSafetyBoundaryUnavailableCopy("en", category);
    expect(copy.body).toContain(explanation);
    expect(copy.body).toContain("The text stays in the box");
    expect(copy.body).toContain("was not added to the conversation");
  });
});
