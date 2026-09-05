import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";

type SummaryGateKind = Exclude<LatestSessionSummaryState["kind"], "none">;

interface SessionSummaryPanelCopy {
  errors: Readonly<Record<SessionSummaryFailureCode, string>>;
  gates: Readonly<Record<SummaryGateKind, { badge: string; consequence: string }>>;
  title: string;
  intro: string;
  notSummarizable: string;
  generate: string;
  rewrite: string;
}

const SESSION_SUMMARY_PANEL_COPY = defineCopy<SessionSummaryPanelCopy>(
  {
    errors: {
      missing_auth: "Sign in to manage the summary.",
      session_data_unavailable: "Summaries are temporarily unavailable.",
      session_not_found: "This conversation wasn't found or has already been deleted.",
      session_not_summarizable:
        "This conversation can be summarised only after it has ended, been interrupted or expired.",
      summary_unavailable: "No summary to approve was found.",
      generation_failed: "The summary couldn't be saved. Please try again in a moment.",
      approval_failed: "The summary couldn't be approved. Please try again in a moment.",
      read_failed: "The summary couldn't be read. Please try again in a moment.",
      provider_unavailable: "The summary couldn't be generated. You can try again later.",
      account_blocked: "The account is blocked.",
      account_access_unavailable: "We couldn't verify access to the account. Please try again.",
    },
    gates: {
      preview: { badge: "Summary preview", consequence: "An optional summary of this one conversation." },
      approved: { badge: "Saved summary", consequence: "The avatar's memory covers all earlier conversations." },
      stale: {
        badge: "This version has been replaced",
        consequence: "An older version of this conversation's summary.",
      },
    },
    title: "Summary of this conversation",
    intro:
      "A short summary of just this conversation, to read in your history. The conversation memory fills in on its own.",
    notSummarizable: "Active or empty conversations can't be summarised.",
    generate: "Generate a summary",
    rewrite: "Write it anew",
  },
  {
    errors: {
      missing_auth: "Zaloguj się, żeby zarządzać podsumowaniem.",
      session_data_unavailable: "Podsumowania są chwilowo niedostępne.",
      session_not_found: "Nie znaleziono tej rozmowy albo została już usunięta.",
      session_not_summarizable: "Tę rozmowę można podsumować dopiero po zakończeniu, przerwaniu albo wygaśnięciu.",
      summary_unavailable: "Nie znaleziono podsumowania do zatwierdzenia.",
      generation_failed: "Nie udało się zapisać podsumowania. Spróbuj ponownie za chwilę.",
      approval_failed: "Nie udało się zatwierdzić podsumowania. Spróbuj ponownie za chwilę.",
      read_failed: "Nie udało się odczytać podsumowania. Spróbuj ponownie za chwilę.",
      provider_unavailable: "Nie udało się wygenerować podsumowania. Możesz spróbować ponownie później.",
      account_blocked: "Konto jest zablokowane.",
      account_access_unavailable: "Nie udało się zweryfikować dostępu do konta. Spróbuj ponownie.",
    },
    gates: {
      preview: { badge: "Podgląd podsumowania", consequence: "Opcjonalne streszczenie tej jednej rozmowy." },
      approved: {
        badge: "Zapisane podsumowanie",
        consequence: "Pamięć awatara obejmuje wszystkie wcześniejsze rozmowy.",
      },
      stale: { badge: "Ta wersja została zastąpiona", consequence: "Starsza wersja podsumowania tej rozmowy." },
    },
    title: "Podsumowanie tej rozmowy",
    intro: "Krótkie streszczenie tylko tej rozmowy, do przeczytania w historii. Pamięć rozmów uzupełnia się sama.",
    notSummarizable: "Aktywne albo puste rozmowy nie mogą zostać podsumowane.",
    generate: "Wygeneruj podsumowanie",
    rewrite: "Napisz od nowa",
  },
);

export function getSessionSummaryPanelCopy(locale: Locale): SessionSummaryPanelCopy {
  return SESSION_SUMMARY_PANEL_COPY[locale];
}
