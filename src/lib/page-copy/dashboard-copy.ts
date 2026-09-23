import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { plural } from "@/lib/i18n/plural";

const DASHBOARD_COPY = defineCopy(
  {
    pageTitle: "Dashboard - SafeSpace",
    greeting: "Hello.",
    intro: "Start a conversation here and come back to its transcripts.",
    avatarUpdated: "The perspective has been saved. You can start a conversation.",
    choiceFetchFailed:
      "We couldn't load the saved perspective. You can go back to choosing it or try again in a moment.",
    changePerspective: "Change perspective",
    otherSessionTitle: (avatarName: string | null) =>
      avatarName
        ? `You have a conversation in progress with the “${avatarName}” perspective`
        : "You have a conversation in progress with another perspective",
    otherSessionBody:
      "Return to it before starting a new one — an ongoing conversation won't stop on its own, and its time is running.",
    backToConversation: "Back to the conversation",
    activeWithThisPerspective:
      "A conversation with this perspective is in progress. Changing the perspective takes effect from the next conversation.",
    startStateFailed: "We couldn't read the conversation state. Refresh the dashboard in a moment.",
    startUnavailable: "Conversations are temporarily unavailable. Please try again in a moment.",
    memoryShortcut: (firstName: string) => `What ${firstName} remembers`,
    memoryPeopleCount: (count: number) => plural("en", count, { one: "1 person", many: `${count} people` }),
    memoryTopicCount: (count: number) => plural("en", count, { one: "1 topic", many: `${count} topics` }),
    memoryPendingCount: (count: number) => `${count} to confirm`,
    memoryEmpty: "Still empty; it fills in after conversations.",
    memorySummaryOnly: "The summary of earlier conversations",
    firstStepsTitle: "Who would you like to talk to?",
    firstStepsBody: "Each perspective listens a little differently. You can change it before the next conversation.",
    firstStepsLegend: "Perspective",
    firstStepsDefaultHint: "A good first choice if you're not sure yet what you're looking for.",
    comparePerspectives: "Compare all perspectives",
    startWith: (withAvatar: string) => `Start a conversation ${withAvatar}`,
    startGeneric: "Start a conversation",
    quote: (text: string) => `“${text}”`,
    budgetNote: (minutes: string) => `A conversation lasts up to ${minutes}. The clock starts only once it begins.`,
    helpTitle: "If something urgent is happening",
  },
  {
    pageTitle: "Panel - SafeSpace",
    greeting: "Dzień dobry.",
    intro: "Stąd rozpoczniesz rozmowę i wrócisz do jej zapisów.",
    avatarUpdated: "Perspektywa została zapisana. Możesz rozpocząć rozmowę.",
    choiceFetchFailed:
      "Nie udało się pobrać zapisanej perspektywy. Możesz wrócić do jej wyboru albo spróbować ponownie za chwilę.",
    changePerspective: "Zmień perspektywę",
    otherSessionTitle: (avatarName) =>
      avatarName ? `Masz rozmowę w toku z perspektywą „${avatarName}”` : "Masz rozmowę w toku z inną perspektywą",
    otherSessionBody: "Wróć do niej, zanim zaczniesz nową — trwająca rozmowa nie przerwie się sama, a jej czas płynie.",
    backToConversation: "Wróć do rozmowy",
    activeWithThisPerspective:
      "Rozmowa z tą perspektywą jest w toku. Zmiana perspektywy zadziała dopiero od następnej rozmowy.",
    startStateFailed: "Nie udało się odczytać stanu rozmowy. Odśwież panel za chwilę.",
    startUnavailable: "Rozmowa jest chwilowo niedostępna. Spróbuj ponownie za chwilę.",
    memoryShortcut: (firstName) => `Co ${firstName} pamięta`,
    memoryPeopleCount: (count) => plural("pl", count, { one: "1 osoba", few: `${count} osoby`, many: `${count} osób` }),
    memoryTopicCount: (count) =>
      plural("pl", count, { one: "1 temat", few: `${count} tematy`, many: `${count} tematów` }),
    memoryPendingCount: (count) => `${count} do potwierdzenia`,
    memoryEmpty: "Jeszcze pusto; zapełni się po rozmowach.",
    memorySummaryOnly: "Podsumowanie wcześniejszych rozmów",
    firstStepsTitle: "Z kim chcesz porozmawiać?",
    firstStepsBody: "Każda perspektywa słucha trochę inaczej. Zmienisz ją przed kolejną rozmową.",
    firstStepsLegend: "Perspektywa",
    firstStepsDefaultHint: "Dobry pierwszy wybór, jeśli jeszcze nie wiesz, czego szukasz.",
    comparePerspectives: "Porównaj wszystkie perspektywy",
    startWith: (withAvatar) => `Zacznij rozmowę ${withAvatar}`,
    startGeneric: "Zacznij rozmowę",
    quote: (text) => `„${text}”`,
    budgetNote: (minutes) => `Rozmowa potrwa do ${minutes}. Czas zacznie biec dopiero po jej rozpoczęciu.`,
    helpTitle: "Gdyby działo się coś pilnego",
  },
);

export function getDashboardCopy(locale: Locale) {
  return DASHBOARD_COPY[locale];
}
