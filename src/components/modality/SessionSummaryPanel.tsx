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
    <div className="rounded-lg border border-[#c8ddd7] bg-white p-4 text-sm leading-6 text-[#38524b]">
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#1f6f65]" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#10231f]">Podsumowanie do kolejnej sesji</p>
          {summaryState.kind === "none" ? (
            <p className="mt-1 text-[#52645f]">
              Brak zatwierdzonego podsumowania dla tej rozmowy. Kontekst kolejnej sesji powstanie dopiero po
              wygenerowaniu preview i świadomym zatwierdzeniu.
            </p>
          ) : null}
          {summaryState.kind !== "none" ? (
            <div className="mt-3 rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-3">
              <p className="text-xs font-semibold tracking-wide text-[#1f6f65] uppercase">
                {summaryState.kind === "approved"
                  ? "Zatwierdzone"
                  : summaryState.kind === "stale"
                    ? "Nieaktualne"
                    : "Preview do zatwierdzenia"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[#10231f]">{summaryState.summary.summaryText}</p>
              {summaryState.kind === "approved" ? (
                <p className="mt-2 text-[#52645f]">
                  To podsumowanie może zostać użyte jako jawny kontekst późniejszej rozmowy.
                </p>
              ) : null}
              {summaryState.kind === "preview" ? (
                <p className="mt-2 text-[#52645f]">
                  Zobacz treść przed użyciem. Dopiero przycisk „Użyj w kolejnej sesji” pozwoli użyć tej rewizji jako
                  kontekstu.
                </p>
              ) : null}
              {summaryState.kind === "stale" ? (
                <p className="mt-2 text-[#52645f]">Ta rewizja nie będzie używana jako kontekst kolejnej sesji.</p>
              ) : null}
            </div>
          ) : null}
          {summaryErrorCode ? (
            <div className="mt-3 flex gap-2 rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-3 text-[#7d2d2d]">
              <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
              <p>{summaryErrorCopy[summaryErrorCode]}</p>
            </div>
          ) : null}
          {!canSummarize ? (
            <p className="mt-3 text-[#52645f]">Aktywne albo puste rozmowy nie mogą zostać podsumowane.</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSummarize || summaryIsBusy}
              onClick={() => {
                onGenerate();
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-3 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#1f6f65] px-3 text-sm font-medium text-white transition-colors hover:bg-[#185a52] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9bb9b3]"
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
