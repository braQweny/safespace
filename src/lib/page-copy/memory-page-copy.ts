import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const MEMORY_PAGE_COPY = defineCopy(
  {
    pageTitle: (firstName: string) => `What ${firstName} remembers - SafeSpace`,
    back: "Back to the dashboard",
    title: (firstName: string) => `What ${firstName} remembers`,
    intro: (firstName: string) =>
      `From your own words in conversations: people, topics and the summary. Correct, merge or remove anything; what you correct, ${firstName} won't change.`,
    settings: "Memory settings",
  },
  {
    pageTitle: (firstName) => `Co ${firstName} pamięta - SafeSpace`,
    back: "Wróć do panelu",
    title: (firstName) => `Co ${firstName} pamięta`,
    intro: (firstName) =>
      `Z Twoich słów w rozmowach: osoby, tematy i podsumowanie. Popraw, scal albo usuń; tego, co poprawisz, ${firstName} już nie zmieni.`,
    settings: "Ustawienia pamięci",
  },
);

export function getMemoryPageCopy(locale: Locale) {
  return MEMORY_PAGE_COPY[locale];
}
