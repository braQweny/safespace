import { PEOPLE_MEMORY_MODE } from "astro:env/server";

/**
 * Jedyny importer `PEOPLE_MEMORY_MODE`. Flaga gasi tworzenie i używanie kart
 * (ekstrakcję, sekcję na panelu, brief w prompcie, starter); zarządzanie
 * istniejącymi zapisami (zapomnienie, usunięcie) działa niezależnie od niej.
 */
export type PeopleMemoryMode = "off" | "on";

/** Wszystko poza dosłownym `on` to `off` — literówka nie może włączyć funkcji. */
export function parsePeopleMemoryMode(value: string | null | undefined): PeopleMemoryMode {
  return value?.trim().toLowerCase() === "on" ? "on" : "off";
}

export function isPeopleMemoryEnabled() {
  try {
    return parsePeopleMemoryMode(PEOPLE_MEMORY_MODE) === "on";
  } catch {
    // Środowisko bez tej zmiennej w schemacie (np. częściowa atrapa w testach)
    // oznacza wyłączoną funkcję, nigdy włączoną.
    return false;
  }
}
