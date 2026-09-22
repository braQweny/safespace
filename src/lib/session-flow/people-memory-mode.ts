import { PEOPLE_MEMORY_MODE } from "astro:env/server";
import { isOnOffFlagOn } from "./on-off-flag";

/**
 * Jedyny importer `PEOPLE_MEMORY_MODE`. Flaga gasi tworzenie i używanie kart
 * (ekstrakcję, sekcję na panelu, brief w prompcie, starter); zarządzanie
 * istniejącymi zapisami (zapomnienie, usunięcie) działa niezależnie od niej.
 */
export function isPeopleMemoryEnabled() {
  return isOnOffFlagOn(() => PEOPLE_MEMORY_MODE);
}
