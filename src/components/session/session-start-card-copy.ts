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
    followupIntro: (name: string) => `${name} will take your earlier conversations into account.`,
    firstIntro:
      "The first conversation starts with whatever you want to bring up today. Opening the dashboard alone doesn't use up a trial or any time.",
    howItWorks: "How it works",
    modeLegend: "Conversation type",
    modeText: "Written",
    modeVoice: "Voice",
    startVoice: "Start a voice conversation",
    startVoiceTrial: (minutes: string) => `Try a voice conversation (${minutes})`,
    preparingVoice: "Preparing the voice conversation…",
    voiceIntro: (name: string) =>
      `You talk out loud and ${name} answers in a voice. The audio goes straight to the model provider; SafeSpace keeps the transcript like a written conversation.`,
    voiceTrialBudget: (minutes: string) => `One try, up to ${minutes}`,
    voiceTrialNote: "Deleting the conversation does not restore it.",
    voiceLimitHint: "A voice conversation has its own allowance: switch to “Voice” above.",
    voiceUnsupported: "A voice conversation needs a browser with a microphone and WebRTC support.",
    voiceUnavailable: "Voice conversations are unavailable right now.",
    voiceTrialUsedLink: "See the account plan",
    howVoiceWorks: "How a voice conversation works",
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
    followupIntro: (name) => `${name} uwzględni wasze wcześniejsze rozmowy.`,
    firstIntro:
      "Pierwsza rozmowa zaczyna się od tego, co chcesz dziś poruszyć. Samo otwarcie panelu nie zużywa próby ani czasu.",
    howItWorks: "Jak to działa",
    modeLegend: "Rodzaj rozmowy",
    modeText: "Pisana",
    modeVoice: "Głosowa",
    startVoice: "Rozpocznij rozmowę głosową",
    startVoiceTrial: (minutes) => `Wypróbuj rozmowę głosową (${minutes})`,
    preparingVoice: "Przygotowujemy rozmowę głosową…",
    voiceIntro: (name) =>
      `Mówisz na głos, a ${name} odpowiada głosem. Dźwięk płynie bezpośrednio do dostawcy modelu; SafeSpace zachowuje zapis jak w rozmowie pisanej.`,
    voiceTrialBudget: (minutes) => `Jedna próba, do ${minutes}`,
    voiceTrialNote: "Usunięcie rozmowy jej nie przywraca.",
    voiceLimitHint: "Rozmowa głosowa ma osobną pulę: przełącz wyżej na „Głosowa”.",
    voiceUnsupported: "Rozmowa głosowa wymaga przeglądarki z mikrofonem i obsługą WebRTC.",
    voiceUnavailable: "Rozmowa głosowa jest teraz niedostępna.",
    voiceTrialUsedLink: "Zobacz plan konta",
    howVoiceWorks: "Jak działa rozmowa głosowa",
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
