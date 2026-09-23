import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/** Które części pamięci wciąż przybywają (flaga i preferencja włączone) — od tego zależy zdanie o mapie. */
export type MemoryGrowingParts = "both" | "people" | "topics";

/**
 * Teksty widoku „Co pamięta”: nagłówki grup listy, wspólny stan pusty i
 * podsumowanie, które awatar czyta przed rozmową. Teksty wierszy, dialogów i
 * mapy zostają w `people-cards-copy` i `topic-map-copy`.
 */
const MEMORY_VIEW_COPY = defineCopy(
  {
    sectionTitle: "People and topics",
    peopleGroup: (count: number) => `People · ${count}`,
    topicsGroup: (count: number) => `Topics · ${count}`,
    emptyAll: (firstName: string) =>
      `Once you mention someone or talk about something you struggle with, ${firstName} will note it here.`,
    mapNotYet: (firstName: string, parts: MemoryGrowingParts) =>
      `The map appears once ${firstName} remembers more ${
        parts === "both" ? "people and topics" : parts === "people" ? "people" : "topics"
      }.`,
    summaryTitle: (firstName: string) => `The summary ${firstName} reads before a conversation`,
    summaryNote: "Filled in before each start, never during a conversation.",
    summaryEmpty: "It appears after the first finished conversation.",
  },
  {
    sectionTitle: "Osoby i tematy",
    peopleGroup: (count) => `Osoby · ${count}`,
    topicsGroup: (count) => `Tematy · ${count}`,
    emptyAll: (firstName) =>
      `Gdy wspomnisz o kimś albo opowiesz o czymś, z czym się mierzysz, ${firstName} zapisze to tutaj.`,
    mapNotYet: (firstName, parts) =>
      `Mapa pojawi się, gdy ${firstName} zapamięta więcej ${
        parts === "both" ? "osób i tematów" : parts === "people" ? "osób" : "tematów"
      }.`,
    summaryTitle: (firstName) => `Podsumowanie, które ${firstName} czyta przed rozmową`,
    summaryNote: "Uzupełniane przed każdym startem, nigdy w trakcie rozmowy.",
    summaryEmpty: "Powstanie po pierwszej zakończonej rozmowie.",
  },
);

export function getMemoryViewCopy(locale: Locale) {
  return MEMORY_VIEW_COPY[locale];
}
