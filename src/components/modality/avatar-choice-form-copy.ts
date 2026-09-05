import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const AVATAR_CHOICE_FORM_COPY = defineCopy(
  {
    saveBarFallback: "The choice applies to your next conversation.",
    upTo: (minutes: string) => ` · up to ${minutes}`,
    saveOnly: "Save only",
    save: "Save the choice",
    start: "Start a conversation",
    groupAria: "Conversation perspectives",
    quote: (sample: string) => `“${sample}”`,
    about: "About the approach",
    note: "Each perspective has its own history. Changing the choice doesn't delete earlier conversations.",
    chosen: (name: string) => `Chosen: ${name}`,
  },
  {
    saveBarFallback: "Wybór dotyczy kolejnej rozmowy.",
    upTo: (minutes) => ` · do ${minutes}`,
    saveOnly: "Tylko zapisz",
    save: "Zapisz wybór",
    start: "Zacznij rozmowę",
    groupAria: "Perspektywy rozmowy",
    quote: (sample) => `„${sample}”`,
    about: "O podejściu",
    note: "Każda perspektywa ma osobną historię. Zmiana wyboru nie usuwa wcześniejszych rozmów.",
    chosen: (name) => `Wybrano: ${name}`,
  },
);

export function getAvatarChoiceFormCopy(locale: Locale) {
  return AVATAR_CHOICE_FORM_COPY[locale];
}
