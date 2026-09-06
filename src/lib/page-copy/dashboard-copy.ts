import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

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
    memorySummary: (firstName: string) => `See what ${firstName} remembers`,
    memoryNote: "Before the next start we'll add the conversations this memory doesn't cover yet.",
    firstStepsEyebrow: "Two steps to your first conversation",
    firstStepsTitle: "First, choose a perspective",
    firstStepsBody:
      "Five ways of listening. Choose who should listen and decide when to start. You can change the perspective before the next conversation.",
    choosePerspective: "Choose a perspective",
    budgetNote: (minutes: string) => `A conversation lasts up to ${minutes}. The clock starts only once it begins.`,
    activeInProgress: "Conversation in progress",
    remainingAbout: (minutes: number) => `About ${minutes} min left.`,
    openTimed: "You have an open conversation with a time limit.",
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
    memorySummary: (firstName) => `Zobacz, co ${firstName} pamięta`,
    memoryNote: "Przed kolejnym startem uzupełnimy tę pamięć o rozmowy, których jeszcze nie obejmuje.",
    firstStepsEyebrow: "Dwa kroki do pierwszej rozmowy",
    firstStepsTitle: "Najpierw wybierz perspektywę",
    firstStepsBody:
      "Pięć sposobów słuchania. Wybierz, kto ma słuchać, i zdecyduj, kiedy zacząć. Perspektywę możesz zmienić przed następną rozmową.",
    choosePerspective: "Wybierz perspektywę",
    budgetNote: (minutes) => `Rozmowa potrwa do ${minutes}. Czas zacznie biec dopiero po jej rozpoczęciu.`,
    activeInProgress: "Rozmowa w toku",
    remainingAbout: (minutes) => `Zostało jeszcze około ${minutes} min.`,
    openTimed: "Masz otwartą rozmowę z limitem czasu.",
    helpTitle: "Gdyby działo się coś pilnego",
  },
);

export function getDashboardCopy(locale: Locale) {
  return DASHBOARD_COPY[locale];
}
