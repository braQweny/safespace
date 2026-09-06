import { SESSION_LENS_MODE } from "astro:env/server";

/**
 * Jedyny importer `SESSION_LENS_MODE`. Flaga włącza wykrywanie i doklejanie
 * soczewek tematycznych w trasie wiadomości; wyłączona oznacza brak dodatkowego
 * wywołania AI i brak sekcji w prompcie, także dla sesji z zapisaną soczewką.
 */
export type SessionLensMode = "off" | "on";

/** Wszystko poza dosłownym `on` to `off` — literówka nie może włączyć funkcji. */
export function parseSessionLensMode(value: string | null | undefined): SessionLensMode {
  return value?.trim().toLowerCase() === "on" ? "on" : "off";
}

export function isSessionLensEnabled() {
  try {
    return parseSessionLensMode(SESSION_LENS_MODE) === "on";
  } catch {
    // Środowisko bez tej zmiennej w schemacie (np. częściowa atrapa w testach)
    // oznacza wyłączoną funkcję, nigdy włączoną.
    return false;
  }
}
