import { TOPIC_MAP_MODE } from "astro:env/server";
import { isOnOffFlagOn } from "./on-off-flag";

/**
 * Jedyny importer `TOPIC_MAP_MODE`. Flaga gasi tworzenie i używanie mapy
 * tematów (ekstrakcję trudności, sekcję na panelu, brief w prompcie);
 * zarządzanie istniejącymi zapisami działa niezależnie od niej.
 */
export function isTopicMapEnabled() {
  return isOnOffFlagOn(() => TOPIC_MAP_MODE);
}
