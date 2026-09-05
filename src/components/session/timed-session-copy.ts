import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionStartPageStateKind } from "@/lib/session-flow/session-state";

interface SessionStateCopy {
  title: string;
  body: string;
}

interface TimedSessionCopy {
  /**
   * Rozmowa startuje w panelu, więc strona rozmowy widuje wyłącznie stany z
   * sesją. Pozostałe wpisy zostają dla kompletności typu i wracają
   * użytkownika do panelu.
   */
  states: Readonly<Record<SessionStartPageStateKind, SessionStateCopy>>;
  backToDashboard: string;
  ending: string;
  endShort: string;
  endLong: string;
  confirmEndAria: string;
  confirmEndTitle: string;
  confirmEndBody: string;
  confirmEndNow: string;
  confirmEndCancel: string;
  boundariesLabel: string;
  openTranscript: string;
  changePerspective: string;
}

const TIMED_SESSION_COPY = defineCopy<TimedSessionCopy>(
  {
    states: {
      ready: {
        title: "The conversation hasn't started yet",
        body: "You start a conversation from the dashboard — that's where the start button is and what it begins with.",
      },
      active: {
        title: "Conversation in progress",
        body: "You can write messages while the conversation time lasts.",
      },
      expired: {
        title: "The conversation time is up",
        body: "Messages can no longer be sent. The transcript has been kept privately, and the next conversation with this perspective will take it into account on its own.",
      },
      completed: {
        title: "Conversation ended",
        body: "The transcript has been kept privately. The next conversation with this perspective will take it into account on its own.",
      },
      interrupted: {
        title: "Conversation interrupted",
        body: "The conversation was stopped in a safe state and will not continue.",
      },
      followup_ready: {
        title: "The conversation hasn't started yet",
        body: "You start the next conversation from the dashboard. The memory of earlier conversations with the chosen avatar is prepared automatically.",
      },
      trial_already_claimed: {
        title: "The first free conversation has already been used",
        body: "The first free conversation has already been used on this account. You start the next one from the dashboard, and this transcript is in your history.",
      },
      session_limit_reached: {
        title: "The free conversation allowance has been used up",
        body: "The free plan includes three trial conversations and all of them have been used on this account. Further conversations are available on the premium plan; transcripts are in the history on the dashboard.",
      },
      unavailable: {
        title: "The conversation state is temporarily unavailable",
        body: "We couldn't confirm the free trial availability. Please try again in a moment.",
      },
    },
    backToDashboard: "Back to the dashboard",
    ending: "Ending…",
    endShort: "End",
    endLong: "End the conversation",
    confirmEndAria: "Confirm ending the conversation",
    confirmEndTitle: "End the conversation now?",
    confirmEndBody: "An ended conversation can't be resumed, but its transcript stays in your history.",
    confirmEndNow: "End now",
    confirmEndCancel: "Back to the conversation",
    boundariesLabel: "Conversation boundaries:",
    openTranscript: "Open the transcript",
    changePerspective: "Change perspective",
  },
  {
    states: {
      ready: {
        title: "Rozmowa jeszcze się nie zaczęła",
        body: "Rozmowę rozpoczniesz w panelu — tam jest przycisk startu i informacja, z czym się zacznie.",
      },
      active: {
        title: "Rozmowa trwa",
        body: "Możesz pisać wiadomości, dopóki trwa czas rozmowy.",
      },
      expired: {
        title: "Czas rozmowy minął",
        body: "Nie da się już wysyłać wiadomości. Zapis został zachowany prywatnie, a następna rozmowa z tą perspektywą uwzględni go sama.",
      },
      completed: {
        title: "Rozmowa zakończona",
        body: "Zapis został zachowany prywatnie. Następna rozmowa z tą perspektywą uwzględni go sama.",
      },
      interrupted: {
        title: "Rozmowa przerwana",
        body: "Rozmowa została zatrzymana w bezpiecznym stanie i nie będzie kontynuowana.",
      },
      followup_ready: {
        title: "Rozmowa jeszcze się nie zaczęła",
        body: "Kolejną rozmowę rozpoczniesz w panelu. Pamięć wcześniejszych rozmów z wybranym awatarem zostanie przygotowana automatycznie.",
      },
      trial_already_claimed: {
        title: "Pierwsza darmowa rozmowa została już wykorzystana",
        body: "Pierwsza darmowa rozmowa została już użyta na tym koncie. Kolejną rozmowę rozpoczniesz w panelu, a zapis tej znajdziesz w historii.",
      },
      session_limit_reached: {
        title: "Limit bezpłatnych rozmów został wykorzystany",
        body: "Plan bezpłatny obejmuje trzy rozmowy próbne i wszystkie zostały już użyte na tym koncie. Dalsze rozmowy są dostępne w planie premium; zapisy znajdziesz w historii w panelu.",
      },
      unavailable: {
        title: "Stan rozmowy jest chwilowo niedostępny",
        body: "Nie udało się potwierdzić dostępności darmowej próby. Spróbuj ponownie za chwilę.",
      },
    },
    backToDashboard: "Wróć do panelu",
    ending: "Kończenie…",
    endShort: "Zakończ",
    endLong: "Zakończ rozmowę",
    confirmEndAria: "Potwierdź zakończenie rozmowy",
    confirmEndTitle: "Na pewno zakończyć rozmowę?",
    confirmEndBody: "Zakończonej rozmowy nie da się wznowić, ale jej zapis pozostanie w historii.",
    confirmEndNow: "Zakończ teraz",
    confirmEndCancel: "Wróć do rozmowy",
    boundariesLabel: "Granice rozmowy:",
    openTranscript: "Otwórz zapis",
    changePerspective: "Zmień perspektywę",
  },
);

export function getTimedSessionCopy(locale: Locale): TimedSessionCopy {
  return TIMED_SESSION_COPY[locale];
}
