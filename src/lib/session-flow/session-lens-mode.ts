import { SESSION_LENS_MODE } from "astro:env/server";
import { isOnOffFlagOn } from "./on-off-flag";

/**
 * Jedyny importer `SESSION_LENS_MODE`. Flaga włącza wykrywanie i doklejanie
 * soczewek tematycznych w trasie wiadomości; wyłączona oznacza brak dodatkowego
 * wywołania AI i brak sekcji w prompcie, także dla sesji z zapisaną soczewką.
 */
export function isSessionLensEnabled() {
  return isOnOffFlagOn(() => SESSION_LENS_MODE);
}
