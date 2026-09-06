import { TOPIC_MAP_MODE } from "astro:env/server";

/**
 * Jedyny importer `TOPIC_MAP_MODE`. Flaga gasi tworzenie i używanie mapy
 * tematów (ekstrakcję trudności, sekcję na panelu, brief w prompcie);
 * zarządzanie istniejącymi zapisami działa niezależnie od niej.
 */
export type TopicMapMode = "off" | "on";

/** Wszystko poza dosłownym `on` to `off` — literówka nie może włączyć funkcji. */
export function parseTopicMapMode(value: string | null | undefined): TopicMapMode {
  return value?.trim().toLowerCase() === "on" ? "on" : "off";
}

export function isTopicMapEnabled() {
  try {
    return parseTopicMapMode(TOPIC_MAP_MODE) === "on";
  } catch {
    // Środowisko bez tej zmiennej w schemacie (np. częściowa atrapa w testach)
    // oznacza wyłączoną funkcję, nigdy włączoną.
    return false;
  }
}
