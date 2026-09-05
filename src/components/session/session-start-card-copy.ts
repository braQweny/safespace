import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const SESSION_START_CARD_COPY = defineCopy(
  {
    limitReachedTitle: "The free conversation allowance has been used up",
    limitReachedBody:
      "The free plan includes three trial conversations and all of them have already been used on this account. Further conversations are available on the premium plan. Transcripts of your conversations are in the conversation history.",
    writeAboutPremium: "Write to us about premium",
    trialAlreadyClaimed:
      "The first free conversation has already been used on this account. Transcripts are in the conversation history.",
    unavailable: "We couldn't confirm that a conversation is available. Refresh the dashboard in a moment.",
    budget: (minutes: string) => `Up to ${minutes} of conversation`,
    preparing: "Preparing the conversation…",
    start: "Start the conversation",
    readingHistory: (name: string) =>
      `${name} is reading your earlier conversations. The conversation clock hasn't started yet; with a longer history this can take up to a minute.`,
    redirecting: "You'll be taken to the conversation screen in a moment.",
    followupIntro: (name: string) =>
      `${name} will take your earlier conversations into account. Opening the dashboard alone doesn't use up a trial or any time.`,
    firstIntro:
      "The first conversation starts with whatever you want to bring up today. Opening the dashboard alone doesn't use up a trial or any time.",
    howItWorks: "How it works",
    notices: {
      startFailedTitle: "The conversation couldn't be started",
      connectionUnavailableBody: "The connection to the server is temporarily unavailable.",
      rateLimitedTitle: "Too many attempts in a short time",
      rateLimitedBody: "Wait about a minute and try starting the conversation again.",
      memoryFailedTitle: "The conversation memory couldn't be prepared",
      memoryFailedBody: "Try again. The saved progress is kept, and the new conversation hasn't started yet.",
      startFailedBody: "Try again in a moment or refresh the dashboard.",
    },
  },
  {
    limitReachedTitle: "Pula bezpłatnych rozmów została wykorzystana",
    limitReachedBody:
      "Plan bezpłatny obejmuje trzy rozmowy próbne i wszystkie zostały już wykorzystane na tym koncie. Dalsze rozmowy są dostępne w planie premium. Zapisy dotychczasowych rozmów znajdziesz w historii rozmów.",
    writeAboutPremium: "Napisz w sprawie premium",
    trialAlreadyClaimed:
      "Pierwsza darmowa rozmowa została już wykorzystana na tym koncie. Zapisy znajdziesz w historii rozmów.",
    unavailable: "Nie udało się potwierdzić dostępności rozmowy. Odśwież panel za chwilę.",
    budget: (minutes) => `Do ${minutes} rozmowy`,
    preparing: "Przygotowujemy rozmowę…",
    start: "Rozpocznij rozmowę",
    readingHistory: (name) =>
      `${name} czyta wasze wcześniejsze rozmowy. Czas rozmowy jeszcze nie biegnie; przy dłuższej historii może to potrwać do minuty.`,
    redirecting: "Za chwilę przejdziesz do ekranu rozmowy.",
    followupIntro: (name) =>
      `${name} uwzględni wasze wcześniejsze rozmowy. Samo otwarcie panelu nie zużywa próby ani czasu.`,
    firstIntro:
      "Pierwsza rozmowa zaczyna się od tego, co chcesz dziś poruszyć. Samo otwarcie panelu nie zużywa próby ani czasu.",
    howItWorks: "Jak to działa",
    notices: {
      startFailedTitle: "Nie udało się rozpocząć rozmowy",
      connectionUnavailableBody: "Połączenie z serwerem jest chwilowo niedostępne.",
      rateLimitedTitle: "Za dużo prób w krótkim czasie",
      rateLimitedBody: "Odczekaj około minuty i spróbuj ponownie rozpocząć rozmowę.",
      memoryFailedTitle: "Nie udało się przygotować pamięci rozmów",
      memoryFailedBody:
        "Spróbuj ponownie. Zapisany postęp zostaje zachowany, a nowa rozmowa nie została jeszcze rozpoczęta.",
      startFailedBody: "Spróbuj ponownie za chwilę albo odśwież panel.",
    },
  },
);

export function getSessionStartCardCopy(locale: Locale) {
  return SESSION_START_CARD_COPY[locale];
}
