/**
 * Języki interfejsu. Angielski jest domyślny dla każdego, kto nie wybrał
 * inaczej — świadomie bez `Accept-Language`, żeby ta sama osoba widziała
 * to samo na każdym urządzeniu, dopóki nie przełączy sama.
 */
export const LOCALES = ["en", "pl"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie z jawnym wyborem; brak cookie znaczy „domyślny”, nigdy „polski”. */
export const LOCALE_COOKIE_NAME = "safespace-locale";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Nazwa języka po angielsku — do promptów, które są pisane po angielsku. */
export const LANGUAGE_NAME: Readonly<Record<Locale, string>> = {
  en: "English",
  pl: "Polish",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Cokolwiek, co nie jest znanym językiem, staje się domyślnym. */
export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Tag BCP 47 dla `Intl.*`. */
export function localeTag(locale: Locale): "en-US" | "pl-PL" {
  return locale === "pl" ? "pl-PL" : "en-US";
}

export function openGraphLocale(locale: Locale): "en_US" | "pl_PL" {
  return locale === "pl" ? "pl_PL" : "en_US";
}

export function otherLocale(locale: Locale): Locale {
  return locale === "pl" ? "en" : "pl";
}
