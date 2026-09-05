import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import type { SessionHistoryFailureCode } from "@/lib/session-flow/session-history-contract";

export interface SessionStatusLegendEntry {
  label: string;
  description: string;
}

interface SessionHistoryCopy {
  /** `title` odznaki na liście i ewentualna legenda mówią dokładnie to samo. */
  statusLegend: Readonly<Record<SessionHistoryListItem["status"], SessionStatusLegendEntry>>;
  noDate: string;
  today: string;
  yesterday: string;
  unknownTime: string;
  duration: {
    underMinute: string;
    minutes: (minutes: number) => string;
    upTo: (minutes: number) => string;
    unknown: string;
  };
  summaryMarks: Readonly<Record<Exclude<SessionHistoryListItem["summaryState"], "none">, string>>;
  openTranscriptSr: (dateTime: string) => string;
  remainingAria: string;
  remaining: (time: string) => string;
  backToConversation: string;
  errors: Readonly<Record<SessionHistoryFailureCode, string>>;
  title: string;
  deleted: string;
  choosePerspective: string;
  loading: string;
  empty: string;
  dialogAria: string;
  page: (page: number) => string;
  previous: string;
  next: string;
  filterNotice: string;
  filterLabel: string;
  countSr: string;
  detail: {
    title: string;
    deleteConversation: string;
    close: string;
    readOnly: string;
    confirmDeleteTitle: string;
    confirmDeleteBody: string;
    cancel: string;
    confirmDelete: string;
    loadingConversation: string;
    openFailed: string;
    summaryDisclosure: string;
    emptyTranscript: string;
    idleHint: string;
  };
}

const SESSION_HISTORY_COPY = defineCopy<SessionHistoryCopy>(
  {
    statusLegend: {
      created: { label: "Created", description: "The conversation was prepared but didn't get started." },
      active: {
        label: "Active",
        description: "The conversation is in progress — you can return to it until its time runs out.",
      },
      completed: { label: "Ended", description: "A conversation you ended. Its transcript remains available." },
      expired: {
        label: "Timed out",
        description: "The conversation's time limit passed — you can no longer write in it.",
      },
      interrupted: { label: "Interrupted", description: "A conversation stopped by the safety mechanism." },
    },
    noDate: "No date",
    today: "Today",
    yesterday: "Yesterday",
    unknownTime: "—",
    duration: {
      underMinute: "under a minute",
      minutes: (minutes) => `${minutes} min conversation`,
      upTo: (minutes) => `up to ${minutes} min`,
      unknown: "Length unknown",
    },
    summaryMarks: { approved: "Summary", preview: "Summary awaiting a decision", stale: "Summary out of date" },
    openTranscriptSr: (dateTime) => `Open the conversation transcript: ${dateTime}.`,
    remainingAria: "Conversation time left",
    remaining: (time) => `${time} left`,
    backToConversation: "Back to the conversation",
    errors: {
      missing_auth: "Sign in to see your conversation history.",
      invalid_avatar: "The chosen avatar couldn't be recognised.",
      invalid_page: "Invalid history page number.",
      session_not_found: "This conversation wasn't found or has already been deleted.",
      read_failed: "The history couldn't be read. Please try again in a moment.",
      delete_failed: "The conversation couldn't be deleted. Please try again in a moment.",
      session_data_unavailable: "Conversation history is temporarily unavailable.",
      account_blocked: "The account is blocked.",
      account_access_unavailable: "We couldn't verify access to the account. Please try again.",
    },
    title: "Conversation history",
    deleted: "The conversation transcript has been deleted.",
    choosePerspective: "Choose a perspective to see its saved conversations.",
    loading: "Loading history",
    empty: "No saved conversations for this perspective.",
    dialogAria: "Conversation transcript",
    page: (page) => `Page ${page}`,
    previous: "Previous",
    next: "Next",
    filterNotice:
      "You'll start the next conversation with the saved perspective. This filter only changes the history.",
    filterLabel: "Conversations with:",
    countSr: ", conversations: ",
    detail: {
      title: "Conversation transcript",
      deleteConversation: "Delete conversation",
      close: "Close",
      readOnly: "Read only",
      confirmDeleteTitle: "Confirm deleting the conversation",
      confirmDeleteBody:
        "Deletion is irreversible and does not restore a free trial. The conversation content will be permanently deleted.",
      cancel: "Cancel",
      confirmDelete: "Confirm deletion",
      loadingConversation: "Loading the conversation",
      openFailed: "This conversation couldn't be opened.",
      summaryDisclosure: "Summary of this conversation",
      emptyTranscript: "This conversation has no saved messages.",
      idleHint: "Open a conversation from the list to see the full read-only transcript.",
    },
  },
  {
    statusLegend: {
      created: { label: "Utworzona", description: "Rozmowa została przygotowana, ale nie zdążyła się rozpocząć." },
      active: {
        label: "Aktywna",
        description: "Rozmowa trwa — możesz do niej wrócić, dopóki nie minie czas rozmowy.",
      },
      completed: { label: "Zakończona", description: "Rozmowa zakończona przez Ciebie. Jej zapis pozostaje dostępny." },
      expired: { label: "Po czasie", description: "Minął limit czasu rozmowy — nie da się już w niej pisać." },
      interrupted: { label: "Przerwana", description: "Rozmowa zatrzymana przez mechanizm bezpieczeństwa." },
    },
    noDate: "Brak daty",
    today: "Dzisiaj",
    yesterday: "Wczoraj",
    unknownTime: "—",
    duration: {
      underMinute: "krócej niż minutę",
      minutes: (minutes) => `${minutes} min rozmowy`,
      upTo: (minutes) => `do ${minutes} min`,
      unknown: "Czas nieustalony",
    },
    summaryMarks: {
      approved: "Podsumowanie",
      preview: "Podsumowanie czeka na decyzję",
      stale: "Podsumowanie nieaktualne",
    },
    openTranscriptSr: (dateTime) => `Otwórz zapis rozmowy: ${dateTime}.`,
    remainingAria: "Pozostały czas rozmowy",
    remaining: (time) => `Pozostało ${time}`,
    backToConversation: "Wróć do rozmowy",
    errors: {
      missing_auth: "Zaloguj się, żeby zobaczyć historię rozmów.",
      invalid_avatar: "Nie udało się rozpoznać wybranego awatara.",
      invalid_page: "Nieprawidłowy numer strony historii.",
      session_not_found: "Nie znaleziono tej rozmowy albo została już usunięta.",
      read_failed: "Nie udało się odczytać historii. Spróbuj ponownie za chwilę.",
      delete_failed: "Nie udało się usunąć rozmowy. Spróbuj ponownie za chwilę.",
      session_data_unavailable: "Historia rozmów jest chwilowo niedostępna.",
      account_blocked: "Konto jest zablokowane.",
      account_access_unavailable: "Nie udało się zweryfikować dostępu do konta. Spróbuj ponownie.",
    },
    title: "Historia rozmów",
    deleted: "Zapis rozmowy został usunięty.",
    choosePerspective: "Wybierz perspektywę, żeby zobaczyć jej zapisane rozmowy.",
    loading: "Ładowanie historii",
    empty: "Brak zapisanych rozmów dla tej perspektywy.",
    dialogAria: "Zapis rozmowy",
    page: (page) => `Strona ${page}`,
    previous: "Poprzednia",
    next: "Następna",
    filterNotice: "Kolejną rozmowę rozpoczniesz z zapisaną perspektywą. Ten filtr zmienia tylko historię.",
    filterLabel: "Rozmowy z:",
    countSr: ", rozmów: ",
    detail: {
      title: "Zapis rozmowy",
      deleteConversation: "Usuń rozmowę",
      close: "Zamknij",
      readOnly: "Tylko do odczytu",
      confirmDeleteTitle: "Potwierdź usunięcie rozmowy",
      confirmDeleteBody:
        "Usunięcie jest nieodwracalne i nie przywraca darmowej próby. Treść rozmowy zostanie trwale usunięta.",
      cancel: "Anuluj",
      confirmDelete: "Potwierdź usunięcie",
      loadingConversation: "Ładowanie rozmowy",
      openFailed: "Nie udało się otworzyć tej rozmowy.",
      summaryDisclosure: "Podsumowanie tej rozmowy",
      emptyTranscript: "Ta rozmowa nie ma zapisanych wiadomości.",
      idleHint: "Otwórz rozmowę z listy, żeby zobaczyć pełny zapis tylko do odczytu.",
    },
  },
);

export function getSessionHistoryCopy(locale: Locale): SessionHistoryCopy {
  return SESSION_HISTORY_COPY[locale];
}
