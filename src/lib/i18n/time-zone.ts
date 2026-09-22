import type { AstroCookies } from "astro";

/**
 * Strefa, w której serwer i wyspy formatują daty. Jedna wartość na żądanie
 * po obu stronach hydratacji — różnica stref serwer/przeglądarka rozjeżdżała
 * kiedyś etykiety dni — ale już nie ta sama dla wszystkich: pochodzi z
 * ciasteczka, które przed pierwszym malowaniem zapisuje skrypt w
 * `Layout.astro` (`Intl…resolvedOptions().timeZone`). Warszawa zostaje
 * zapasem, gdy ciasteczka jeszcze nie ma (pierwsza wizyta) albo jest zepsute.
 *
 * Strefa nie jest dozwolonym polem logów i nie trafia do bazy.
 */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw";

/** Musi się zgadzać ze skryptem w `Layout.astro`, który je zapisuje. */
export const TIME_ZONE_COOKIE_NAME = "safespace-tz";

// Nazwy IANA („America/New_York”, „Etc/GMT+5”, „UTC”); długość i znaki
// odsiewają śmieci, zanim dotkną `Intl`.
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/;

/**
 * Walidacja przez samo `Intl`: nieznana strefa rzuca `RangeError`. Zwraca
 * kanoniczną nazwę z `resolvedOptions()`, więc serwer i wyspa dostają ten sam
 * napis, nawet gdy przeglądarka podała starszy alias.
 */
export function parseTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !TIME_ZONE_PATTERN.test(value)) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function resolveRequestTimeZone(cookies: Pick<AstroCookies, "get">): string {
  return parseTimeZone(cookies.get(TIME_ZONE_COOKIE_NAME)?.value) ?? DEFAULT_TIME_ZONE;
}
