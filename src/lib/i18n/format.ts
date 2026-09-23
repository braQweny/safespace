import { localeTag, type Locale } from "./locale";

/**
 * Każda funkcja dostaje strefę jawnie (`context.locals.timeZone` na serwerze,
 * `useTimeZone()` w wyspie — ta sama wartość po obu stronach hydratacji; patrz
 * `time-zone.ts`). Nigdy strefa przeglądarki w czasie renderu, bo znaczniki by
 * się rozjechały. Formattery powstają wewnątrz funkcji, nigdy jako stałe
 * modułu, bo język i strefa są znane dopiero z żądania.
 */
function dateTimeFormat(locale: Locale, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(localeTag(locale), { ...options, timeZone });
}

export function formatDay(locale: Locale, timeZone: string, date: Date): string {
  return dateTimeFormat(locale, timeZone, { dateStyle: "medium" }).format(date);
}

export function formatTimeOfDay(locale: Locale, timeZone: string, date: Date): string {
  return dateTimeFormat(locale, timeZone, { timeStyle: "short" }).format(date);
}

export function formatDateTime(locale: Locale, timeZone: string, date: Date): string {
  return dateTimeFormat(locale, timeZone, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Klucz dnia `RRRR-MM-DD` w podanej strefie, niezależny od języka — do
 * grupowania i porównań „dziś/wczoraj”, nigdy do wyświetlania.
 */
export function getDayKey(timeZone: string, date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}
