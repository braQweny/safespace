import { AlertCircle, CheckCircle2, FileText, Loader2, Sparkles } from "lucide-react";
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
  missing_auth: "Musisz być zalogowany, żeby zarządzać podsumowaniem.",
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
    <div className="border-line-strong text-ink-soft rounded-lg border bg-white p-4 text-sm leading-6">
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="text-brand mt-1 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-ink font-semibold">Podsumowanie do kolejnej sesji</p>
          {summaryState.kind === "none" ? (
            <p className="text-ink-muted mt-1">
              Brak zatwierdzonego podsumowania dla tej rozmowy. Kontekst kolejnej sesji powstanie dopiero po
              wygenerowaniu wersji roboczej i jej świadomym zatwierdzeniu.
            </p>
          ) : null}
          {summaryState.kind !== "none" ? (
            <div className="border-line bg-surface-soft mt-3 rounded-lg border p-3">
              <p className="text-brand text-xs font-semibold tracking-wide uppercase">
                {summaryState.kind === "approved"
                  ? "Zatwierdzone"
                  : summaryState.kind === "stale"
                    ? "Nieaktualne"
                    : "Wersja robocza do zatwierdzenia"}
              </p>
              <p className="text-ink mt-2 whitespace-pre-wrap">{summaryState.summary.summaryText}</p>
              {summaryState.kind === "approved" ? (
                <p className="text-ink-muted mt-2">
                  To podsumowanie może zostać użyte jako jawny kontekst późniejszej rozmowy.
                </p>
              ) : null}
              {summaryState.kind === "preview" ? (
                <p className="text-ink-muted mt-2">
                  Zobacz treść przed użyciem. Dopiero przycisk „Użyj w kolejnej sesji” pozwoli użyć tej wersji jako
                  kontekstu.
                </p>
              ) : null}
              {summaryState.kind === "stale" ? (
                <p className="text-ink-muted mt-2">Ta wersja nie będzie używana jako kontekst kolejnej sesji.</p>
              ) : null}
            </div>
          ) : null}
          {summaryErrorCode ? (
            <div className="border-danger-line bg-danger-soft text-danger mt-3 flex gap-2 rounded-lg border p-3">
              <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
              <p>{summaryErrorCopy[summaryErrorCode]}</p>
            </div>
          ) : null}
          {!canSummarize ? (
            <p className="text-ink-muted mt-3">Aktywne albo puste rozmowy nie mogą zostać podsumowane.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSummarize || summaryIsBusy}
              onClick={() => {
                onGenerate();
              }}
              className="border-line-accent text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {summaryStatus === "generating" ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" className="h-4 w-4" />
              )}
              {summaryState.kind === "none" ? "Generuj podsumowanie" : "Wygeneruj ponownie"}
            </button>
            <button
              type="button"
              disabled={summaryState.kind === "none" || summaryState.kind === "approved" || summaryIsBusy}
              onClick={() => {
                onApprove();
              }}
              className="bg-brand focus:ring-brand-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white transition-colors hover:bg-[#185a52] focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9bb9b3]"
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
      </div>
    </div>
  );
}
