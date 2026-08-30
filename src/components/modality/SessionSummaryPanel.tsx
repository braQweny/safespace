import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";
import type { SessionSummaryStatus } from "@/components/hooks/useSessionSummary";
import { SUMMARY_APPROVE_LABEL } from "@/lib/session-copy";
import { cn } from "@/lib/utils";

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

interface SummaryGateState {
  /** Napis na kaflu stanu — jedno zdanie o tym, czy coś przechodzi dalej. */
  badge: string;
  badgeClassName: string;
  /** Zdanie pod kaflem: co z tego wynika dla następnej rozmowy. */
  consequence: string;
  /** Łuk ze znaku marki wypełnia się dopiero wtedy, gdy coś naprawdę przechodzi. */
  arch: "open" | "closed" | "dashed";
  paperClassName: string;
}

const summaryGateStates: Record<Exclude<LatestSessionSummaryState["kind"], "none">, SummaryGateState> = {
  preview: {
    badge: "Jeszcze nie przechodzi dalej",
    badgeClassName: "bg-surface-soft text-ink-muted",
    consequence: "Następna rozmowa tego nie zna. Przeczytaj i zdecyduj.",
    arch: "open",
    paperClassName: "bg-surface-soft",
  },
  approved: {
    badge: "Przechodzi do następnej rozmowy",
    badgeClassName: "bg-brand-tint text-brand-deep",
    consequence: "Następna rozmowa zacznie się z tą wiedzą — i tylko z nią. Reszta zapisu zostaje tutaj.",
    arch: "closed",
    paperClassName: "bg-brand-tint",
  },
  stale: {
    badge: "Ta wersja została zastąpiona",
    badgeClassName: "bg-surface-soft text-ink-muted",
    consequence: "Nie przejdzie do następnej rozmowy. Zostaje w historii tej rozmowy.",
    arch: "dashed",
    paperClassName: "bg-surface-soft",
  },
};

/** Łuk ze znaku marki: próg, przez który przechodzi dokładnie to, co zatwierdzisz. */
function GateArch({ variant }: { variant: SummaryGateState["arch"] }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <path
        d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
        className={cn(variant === "closed" ? "fill-brand-soft stroke-brand" : "stroke-line-accent fill-none")}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeDasharray={variant === "dashed" ? "3 3" : undefined}
      />
    </svg>
  );
}

export default function SessionSummaryPanel({
  summaryState,
  summaryStatus,
  summaryErrorCode,
  canSummarize,
  onGenerate,
  onApprove,
}: SessionSummaryPanelProps) {
  const summaryIsBusy = summaryStatus !== "idle";
  const gate = summaryState.kind === "none" ? null : summaryGateStates[summaryState.kind];
  const isApproved = summaryState.kind === "approved";

  return (
    <div className="border-line-strong bg-surface shadow-card text-ink-soft rounded-2xl border p-5 text-sm leading-6 sm:p-6">
      <div className="flex items-center gap-2.5">
        <GateArch variant={gate?.arch ?? "open"} />
        <p
          className={cn(
            "text-xs font-semibold tracking-[0.08em] uppercase",
            isApproved ? "text-brand" : "text-ink-muted",
          )}
        >
          Co przechodzi do następnej rozmowy
        </p>
      </div>
      <p className="text-ink mt-2 font-serif text-xl leading-snug font-medium">Podsumowanie tej rozmowy</p>

      {summaryState.kind === "none" ? (
        <p className="text-ink-muted mt-2">
          Możesz streścić tę rozmowę i przepuścić streszczenie do następnej, żeby nie zaczynać od zera. Zobaczysz je
          przed użyciem — nic nie przechodzi dalej bez Twojej zgody.
        </p>
      ) : null}

      {summaryState.kind !== "none" && gate ? (
        <>
          <div className={cn("mt-4 rounded-xl p-4", gate.paperClassName)}>
            {/* Podsumowanie to treść rozmowy, więc dostaje szeryf — czyta się je, nie skanuje. */}
            <p className="text-ink font-serif text-[17px] leading-relaxed whitespace-pre-wrap">
              {summaryState.summary.summaryText}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                gate.badgeClassName,
              )}
            >
              {gate.badge}
            </span>
            <span className="text-ink-muted">{gate.consequence}</span>
          </div>
        </>
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

      {/*
        Jedna decyzja niesie ten panel, więc ma jeden przycisk główny. „Napisz od
        nowa” stoi obok jako akcja cicha — nadpisanie tekstu nie jest tym samym
        co przepuszczenie go dalej.
      */}
      <div className="mt-5 flex flex-wrap gap-2">
        {summaryState.kind === "none" ? (
          <button
            type="button"
            disabled={!canSummarize || summaryIsBusy}
            onClick={onGenerate}
            className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:border-brand-disabled disabled:bg-brand-soft disabled:text-brand-deep inline-flex h-11 items-center justify-center gap-2 rounded-full border border-transparent px-5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
          >
            {summaryStatus === "generating" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
            )}
            Wygeneruj podsumowanie
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={isApproved || summaryIsBusy}
              onClick={onApprove}
              className={cn(
                "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-transparent px-5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2",
                isApproved
                  ? "bg-brand-tint text-brand-deep cursor-default"
                  : "bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:border-brand-disabled disabled:bg-brand-soft disabled:text-brand-deep disabled:cursor-not-allowed",
              )}
            >
              {summaryStatus === "approving" ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : isApproved ? (
                <Check aria-hidden="true" className="h-4 w-4" />
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {isApproved ? "Przepuszczone" : SUMMARY_APPROVE_LABEL}
            </button>
            <button
              type="button"
              disabled={!canSummarize || summaryIsBusy}
              onClick={onGenerate}
              className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {summaryStatus === "generating" ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="text-brand h-4 w-4" />
              )}
              Napisz od nowa
            </button>
          </>
        )}
      </div>
    </div>
  );
}
