import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { CrisisResourceContactKind } from "@/lib/session-safety/types";

/**
 * Krótkie podpisy pod numerami w zwartym bloku pomocy (panel, landing). Pełne
 * nazwy i opisy z katalogu zostają w panelu „Pomoc teraz” i na stronie
 * prywatności; tutaj kraj mówi nagłówek regionu, więc podpis nazywa tylko rodzaj
 * kontaktu. Klucz `local_guidance` jest pomijany — ten wpis sam jest zdaniem.
 */
const CRISIS_REGION_LIST_COPY = defineCopy<{
  kindLabel: Readonly<Record<Exclude<CrisisResourceContactKind, "local_guidance">, string>>;
}>(
  {
    kindLabel: {
      emergency_number: "Emergency number, in immediate danger",
      crisis_line: "Support line in a mental health crisis",
    },
  },
  {
    kindLabel: {
      emergency_number: "Numer alarmowy, w nagłym zagrożeniu",
      crisis_line: "Wsparcie w kryzysie psychicznym",
    },
  },
);

export function getCrisisRegionListCopy(locale: Locale) {
  return CRISIS_REGION_LIST_COPY[locale];
}
