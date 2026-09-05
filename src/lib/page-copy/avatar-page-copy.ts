import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const AVATAR_PAGE_COPY = defineCopy(
  {
    pageTitle: "Choose a perspective - SafeSpace",
    back: "Back to the dashboard",
    title: "Choose a perspective",
    intro:
      "Read the sample sentences and choose the style that feels close to you. This is an educational choice, not a therapy match.",
    disclosure: "What this means for the conversation",
    paragraphs: [
      "This is an educational choice of perspective for a future conversation simulation. SafeSpace does not replace a professional and does not choose a therapy approach for you; decisions about real therapy are best discussed with a qualified person.",
      "Conversation transcripts are kept separately for each perspective. You'll find them on the dashboard, in the conversation history — that's also where you can switch between perspectives to browse older transcripts.",
    ] as readonly string[],
    activeNotice: "You have a conversation in progress. A change saved here takes effect from the next conversation.",
  },
  {
    pageTitle: "Wybór perspektywy - SafeSpace",
    back: "Wróć do panelu",
    title: "Wybierz perspektywę",
    intro:
      "Przeczytaj przykładowe zdania i wybierz styl, który jest Ci bliski. To wybór edukacyjny, nie dobór terapii.",
    disclosure: "Co to znaczy dla rozmowy",
    paragraphs: [
      "To edukacyjny wybór perspektywy do przyszłej symulacji rozmowy. SafeSpace nie zastępuje specjalisty i nie dobiera nurtu za Ciebie; decyzje dotyczące realnej terapii warto omawiać z wykwalifikowaną osobą.",
      "Zapisy rozmów są prowadzone osobno dla każdej perspektywy. Znajdziesz je w panelu, w historii rozmów — tam też przełączysz się między perspektywami, żeby przejrzeć starsze zapisy.",
    ],
    activeNotice: "Masz rozmowę w toku. Zapisana tu zmiana zadziała dopiero od następnej rozmowy.",
  },
);

export function getAvatarPageCopy(locale: Locale) {
  return AVATAR_PAGE_COPY[locale];
}
