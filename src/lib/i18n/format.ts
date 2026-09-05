import { localeTag, type Locale } from "./locale";

/**
 * Historia liczy dni w jednej strefie po obu stronach hydratacji — kiedyś
 * różnica stref serwer/przeglądarka rozjeżdżała etykiety dni. Formattery
 * powstają wewnątrz funkcji, nigdy jako stałe modułu, bo język jest znany
 * dopiero z żądania.
 */
export const SESSION_TIME_ZONE = "Europe/Warsaw";

function dateTimeFormat(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(localeTag(locale), { ...options, timeZone: SESSION_TIME_ZONE });
}

export function formatDay(locale: Locale, date: Date): string {
  return dateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export function formatTimeOfDay(locale: Locale, date: Date): string {
  return dateTimeFormat(locale, { timeStyle: "short" }).format(date);
}

export function formatDateTime(locale: Locale, date: Date): string {
  return dateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Klucz dnia `RRRR-MM-DD` w strefie sesji, niezależny od języka — do
 * grupowania i porównań „dziś/wczoraj”, nigdy do wyświetlania.
 */
export function getDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}
