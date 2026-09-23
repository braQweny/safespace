/**
 * Wspólny słownik flag `off|on` (`PEOPLE_MEMORY_MODE`, `SESSION_LENS_MODE`,
 * `TOPIC_MAP_MODE`, `VOICE_SESSION_MODE`). Każdą zmienną czyta wyłącznie jej
 * moduł `*-mode.ts`; ten plik nie importuje środowiska.
 */
export type OnOffFlag = "off" | "on";

/** Wszystko poza dosłownym `on` to `off` — literówka nie może włączyć funkcji. */
export function parseOnOffFlag(value: string | null | undefined): OnOffFlag {
  return value?.trim().toLowerCase() === "on" ? "on" : "off";
}

/**
 * `true` tylko dla `on`. Odczyt zmiennej dzieje się wewnątrz `try`: środowisko
 * bez niej w schemacie (np. częściowa atrapa w testach) rzuca przy dostępie i
 * oznacza wyłączoną funkcję, nigdy włączoną.
 */
export function isOnOffFlagOn(read: () => string | null | undefined): boolean {
  try {
    return parseOnOffFlag(read()) === "on";
  } catch {
    return false;
  }
}
