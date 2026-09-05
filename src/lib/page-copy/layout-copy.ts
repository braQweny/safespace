import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const LAYOUT_COPY = defineCopy(
  {
    defaultDescription: "SafeSpace helps you calmly prepare for a first conversation in a psychotherapy simulation.",
  },
  {
    defaultDescription:
      "SafeSpace pomaga spokojnie przygotować się do pierwszej rozmowy w symulacji psychoterapeutycznej.",
  },
);

export function getLayoutCopy(locale: Locale) {
  return LAYOUT_COPY[locale];
}
