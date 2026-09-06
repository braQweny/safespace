import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/**
 * Teksty rozmowy współdzielone przez panel, stronę rozmowy i hook tury.
 * Granice rozmowy padają w kilku miejscach — rozjazd dwóch wersji tego zdania
 * byłby rozjazdem obietnicy produktu, więc jest jedno źródło w obu językach.
 * `turn` trzyma też komunikaty składane przez `useTimedSession`, żeby test
 * diakrytyków i test parytetu objęły je jednym importem.
 */
const SESSION_COPY = defineCopy(
  {
    pageTitle: "Conversation - SafeSpace",
    boundaries:
      "SafeSpace is an educational conversation simulation. It does not diagnose and does not replace a professional. In immediate danger, use real help, such as your local emergency number.",
    perspective:
      "The chosen perspective applies for the whole conversation. Every new conversation automatically uses a summary of all your earlier conversations with this avatar. Conversations with other avatars have their own separate memory.",
    turn: {
      slowResponse: "The reply is taking longer than usual…",
      timeoutTitle: "The reply didn't arrive in time",
      timeoutBody: "Try sending again. Your message text has been kept.",
      unsentMessage: "This message didn't get sent in time:",
      copyUnsent: "Copy",
      copiedUnsent: "Copied",
      copyUnsentFailed: "Copying failed. Select the text and copy it manually.",
      expiredTitle: "The conversation time is up",
      expiredBody: "Messages can no longer be sent in this conversation.",
      sendFailedTitle: "The message couldn't be sent",
      connectionUnavailableBody: "The connection to the server is temporarily unavailable.",
      sendRateLimitedTitle: "Slow down for a moment",
      sendRateLimitedBody:
        "You're sending messages too quickly. Wait about a minute and try again — your message text has been kept.",
      sendRetryBody: "Try again if the conversation is still going.",
      messageInProgressTitle: "The previous message is still being processed",
      messageConflictTitle: "The message couldn't be confirmed",
      messageRetryPreservedBody: "Wait a moment and try again. Your message text has been kept.",
      endFailedTitle: "The conversation couldn't be ended",
      endRateLimitedTitle: "Too many attempts in a short time",
      endRateLimitedBody: "Wait about a minute and try ending the conversation again.",
      endRetryBody: "Please try again in a moment.",
      sessionNotActiveTitle: "The conversation is no longer active",
      sessionNotActiveBody: "Refresh the history view to see the conversation's current status.",
    },
    dictation: {
      transcriptionFailed: "The recording couldn't be transcribed. Try again or type your message.",
      transcriptionTooLong:
        "The transcription exceeded the message limit. Shorten the text or record a shorter message.",
      microphoneDenied: "Microphone access was not granted. You can type instead.",
      microphoneMissing: "No microphone was found.",
      microphoneUnavailable: "The microphone couldn't be started. You can type instead.",
      recordingTooLarge: "The recording is too long or too large to transcribe. Record a shorter message.",
    },
  },
  {
    pageTitle: "Rozmowa - SafeSpace",
    boundaries:
      "SafeSpace jest edukacyjną symulacją rozmowy. Nie diagnozuje i nie zastępuje specjalisty. W bezpośrednim zagrożeniu skorzystaj z realnej pomocy, np. lokalnego numeru alarmowego.",
    perspective:
      "Wybrana perspektywa obowiązuje przez całą rozmowę. Każda nowa rozmowa automatycznie korzysta z podsumowania wszystkich wcześniejszych rozmów z tym awatarem. Rozmowy z innymi awatarami mają osobną pamięć.",
    turn: {
      slowResponse: "Odpowiedź trwa dłużej niż zwykle…",
      timeoutTitle: "Odpowiedź nie dotarła na czas",
      timeoutBody: "Spróbuj wysłać ponownie. Treść wiadomości została zachowana.",
      unsentMessage: "Ta wiadomość nie zdążyła zostać wysłana:",
      copyUnsent: "Kopiuj",
      copiedUnsent: "Skopiowano",
      copyUnsentFailed: "Nie udało się skopiować. Zaznacz tekst i skopiuj go ręcznie.",
      expiredTitle: "Czas rozmowy minął",
      expiredBody: "W tej rozmowie nie da się już wysyłać wiadomości.",
      sendFailedTitle: "Nie udało się wysłać wiadomości",
      connectionUnavailableBody: "Połączenie z serwerem jest chwilowo niedostępne.",
      sendRateLimitedTitle: "Zwolnij na chwilę",
      sendRateLimitedBody:
        "Wysyłasz wiadomości zbyt szybko. Odczekaj około minuty i spróbuj ponownie — treść wiadomości została zachowana.",
      sendRetryBody: "Spróbuj ponownie, jeśli rozmowa nadal trwa.",
      messageInProgressTitle: "Poprzednia wiadomość jest jeszcze przetwarzana",
      messageConflictTitle: "Nie udało się potwierdzić wiadomości",
      messageRetryPreservedBody: "Odczekaj chwilę i spróbuj ponownie. Treść wiadomości została zachowana.",
      endFailedTitle: "Nie udało się zakończyć rozmowy",
      endRateLimitedTitle: "Za dużo prób w krótkim czasie",
      endRateLimitedBody: "Odczekaj około minuty i spróbuj ponownie zakończyć rozmowę.",
      endRetryBody: "Spróbuj ponownie za chwilę.",
      sessionNotActiveTitle: "Rozmowa nie jest już aktywna",
      sessionNotActiveBody: "Odśwież widok historii, żeby zobaczyć aktualny status rozmowy.",
    },
    dictation: {
      transcriptionFailed: "Nie udało się przepisać nagrania. Spróbuj ponownie albo wpisz tekst.",
      transcriptionTooLong: "Transkrypcja przekroczyła limit wiadomości. Skróć tekst albo nagraj krótszą wypowiedź.",
      microphoneDenied: "Brak zgody na użycie mikrofonu. Możesz pisać.",
      microphoneMissing: "Nie znaleziono mikrofonu.",
      microphoneUnavailable: "Nie udało się uruchomić mikrofonu. Możesz pisać.",
      recordingTooLarge: "Nagranie jest za długie lub za duże, żeby je przepisać. Nagraj krótszą wypowiedź.",
    },
  },
);

export type SessionCopy = (typeof SESSION_COPY)["en"];

export function getSessionCopy(locale: Locale): SessionCopy {
  return SESSION_COPY[locale];
}
