import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  LANGUAGE_NAME,
  LOCALES,
  localeTag,
  openGraphLocale,
  otherLocale,
  parseLocale,
} from "../locale";

describe("locale", () => {
  it("defaults to English and knows exactly two languages", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toEqual(["en", "pl"]);
  });

  it("accepts only the known locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pl")).toBe(true);
    expect(isLocale("PL")).toBe(false);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(1)).toBe(false);
  });

  it("parses anything unknown as the default", () => {
    expect(parseLocale("pl")).toBe("pl");
    expect(parseLocale("fr")).toBe("en");
    expect(parseLocale(null)).toBe("en");
  });

  it("maps to Intl tags, Open Graph locales and the other language", () => {
    expect(localeTag("en")).toBe("en-US");
    expect(localeTag("pl")).toBe("pl-PL");
    expect(openGraphLocale("en")).toBe("en_US");
    expect(openGraphLocale("pl")).toBe("pl_PL");
    expect(otherLocale("en")).toBe("pl");
    expect(otherLocale("pl")).toBe("en");
  });

  it("names every language in English for the prompts", () => {
    for (const locale of LOCALES) {
      expect(LANGUAGE_NAME[locale]).toMatch(/^[A-Z][a-z]+$/);
    }
  });
});
