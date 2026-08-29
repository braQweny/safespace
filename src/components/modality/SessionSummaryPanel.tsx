import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";
import type { SessionSummaryStatus } from "@/components/hooks/useSessionSummary";

interface SessionSummaryPanelProps {
  summaryState: LatestSessionSummaryState;
  summaryStatus: SessionSummaryStatus;
  summaryErrorCode: SessionSummaryFailureCode | null;
  canSummarize: boolean;
  onGenerate: () => void;
  onApprove: () => void;
}

const summaryErrorCopy: Record<SessionSummaryFailureCode, string> = {
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
};

const summaryStateLabel: Record<Exclude<LatestSessionSummaryState["kind"], "none">, string> = {
  approved: "Przekazywane kolejnej sesji",
  stale: "Nieaktualne",
  preview: "Propozycja — jeszcze nieużywana",
};

export default function SessionSummaryPanel({
  summaryState,
  summaryStatus,
  summaryErrorCode,
  canSummarize,
  onGenerate,
  onApprove,
}: SessionSummaryPanelProps) {
  const summaryIsBusy = summaryStatus !== "idle";

  return (
    <div className="border-line-strong bg-surface shadow-card text-ink-soft rounded-2xl border p-5 text-sm leading-6 sm:p-6">
      <p className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">Ciągłość</p>
      <p className="text-ink mt-1 font-serif text-xl leading-snug font-medium">Podsumowanie do kolejnej sesji</p>
      {summaryState.kind === "none" ? (
        <p className="text-ink-muted mt-2">
          Możesz streścić tę rozmowę i przekazać streszczenie kolejnej sesji, żeby nie zaczynać od zera. Zobaczysz je
          przed użyciem — nic nie przechodzi dalej bez Twojej zgody.
        </p>
      ) : null}
      {summaryState.kind !== "none" ? (
        <div className="bg-surface-soft mt-4 rounded-xl p-4">
          <p className="text-brand text-xs font-semibold tracking-[0.08em] uppercase">
            {summaryStateLabel[summaryState.kind]}
          </p>
          {/* Podsumowanie to treść rozmowy, więc dostaje szeryf — czyta się je, nie skanuje. */}
          <p className="text-ink mt-2 font-serif text-[17px] leading-relaxed whitespace-pre-wrap">
            {summaryState.summary.summaryText}
          </p>
          {summaryState.kind === "approved" ? (
            <p className="text-ink-muted mt-3">Kolejna rozmowa zacznie się z tą wiedzą.</p>
          ) : null}
          {summaryState.kind === "preview" ? (
            <p className="text-ink-muted mt-3">
              Przeczytaj i zdecyduj. Kolejna rozmowa pozna tę treść dopiero po kliknięciu „Użyj w kolejnej sesji”.
            </p>
          ) : null}
          {summaryState.kind === "stale" ? (
            <p className="text-ink-muted mt-3">Ta wersja nie zostanie przekazana kolejnej rozmowie.</p>
          ) : null}
        </div>
      ) : null}
      {summaryErrorCode ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 flex gap-2 rounded-xl border p-3">
          <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
          <p>{summaryErrorCopy[summaryErrorCode]}</p>
        </div>
      ) : null}
      {!canSummarize ? (
        <p className="text-ink-muted mt-3">Aktywne albo puste rozmowy nie mogą zostać podsumowane.</p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSummarize || summaryIsBusy}
          onClick={() => {
            onGenerate();
          }}
          className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {summaryStatus === "generating" ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" className="text-brand h-4 w-4" />
          )}
          {summaryState.kind === "none" ? "Wygeneruj podsumowanie" : "Wygeneruj ponownie"}
        </button>
        <button
          type="button"
          disabled={summaryState.kind === "none" || summaryState.kind === "approved" || summaryIsBusy}
          onClick={() => {
            onApprove();
          }}
          className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:bg-brand-disabled inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
        >
          {summaryStatus === "approving" ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          )}
          Użyj w kolejnej sesji
        </button>
      </div>
    </div>
  );
}
