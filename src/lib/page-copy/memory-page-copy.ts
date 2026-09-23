import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const MEMORY_PAGE_COPY = defineCopy(
  {
    pageTitle: (firstName: string) => `What ${firstName} remembers - SafeSpace`,
    back: "Back to the dashboard",
    title: (firstName: string) => `What ${firstName} remembers`,
    intro: (firstName: string) =>
      `From your own words in conversations. You can correct or remove any card — ${firstName} won't overwrite your corrections.`,
    settings: "Memory settings",
  },
  {
    pageTitle: (firstName) => `Co ${firstName} pamięta - SafeSpace`,
    back: "Wróć do panelu",
    title: (firstName) => `Co ${firstName} pamięta`,
    intro: (firstName) =>
      `Z Twoich słów w rozmowach. Każdą kartę możesz poprawić albo usunąć — ${firstName} nie nadpisze Twoich poprawek.`,
    settings: "Ustawienia pamięci",
  },
);

export function getMemoryPageCopy(locale: Locale) {
  return MEMORY_PAGE_COPY[locale];
}
