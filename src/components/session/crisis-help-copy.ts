import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const CRISIS_HELP_COPY = defineCopy(
  {
    triggerShort: "Help",
    triggerLong: "Help now",
    panelAria: "Crisis help contacts",
    eyebrow: "Help now",
    title: "Real help if something urgent is happening",
    closeAria: "Close the help contacts",
    body: "SafeSpace is an educational simulation and is not crisis care. The contacts below lead to real services and support lines.",
  },
  {
    triggerShort: "Pomoc",
    triggerLong: "Pomoc teraz",
    panelAria: "Kontakty pomocy kryzysowej",
    eyebrow: "Pomoc teraz",
    title: "Realna pomoc, jeśli dzieje się coś pilnego",
    closeAria: "Zamknij kontakty pomocy",
    body: "SafeSpace jest symulacją edukacyjną i nie jest pomocą kryzysową. Poniższe kontakty prowadzą do realnych służb i linii wsparcia.",
  },
);

export function getCrisisHelpCopy(locale: Locale) {
  return CRISIS_HELP_COPY[locale];
}
