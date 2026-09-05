import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";
import type { SessionSummaryStatus } from "@/components/hooks/useSessionSummary";
import { cn } from "@/lib/utils";
import { getSessionSummaryPanelCopy } from "./session-summary-panel-copy";

interface SessionSummaryPanelProps {
  summaryState: LatestSessionSummaryState;
  summaryStatus: SessionSummaryStatus;
  summaryErrorCode: SessionSummaryFailureCode | null;
  canSummarize: boolean;
  onGenerate: () => void;
  onApprove: () => void;
}

interface SummaryGateState {
  badgeClassName: string;
  /** Łuk ze znaku marki wypełnia się dopiero wtedy, gdy coś naprawdę przechodzi. */
  arch: "open" | "closed" | "dashed";
  paperClassName: string;
}

// Napisy kafla (badge) i zdanie pod nim żyją w module tekstów; tu tylko wygląd.
const summaryGateStates: Record<Exclude<LatestSessionSummaryState["kind"], "none">, SummaryGateState> = {
  preview: { badgeClassName: "bg-surface-soft text-ink-muted", arch: "open", paperClassName: "bg-surface-soft" },
  approved: { badgeClassName: "bg-brand-tint text-brand-deep", arch: "closed", paperClassName: "bg-brand-tint" },
  stale: { badgeClassName: "bg-surface-soft text-ink-muted", arch: "dashed", paperClassName: "bg-surface-soft" },
};

/** Znak podglądu podsumowania jednej rozmowy. */
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
}: SessionSummaryPanelProps) {
  const copy = getSessionSummaryPanelCopy(useLocale());
  const summaryIsBusy = summaryStatus !== "idle";
  const gate = summaryState.kind === "none" ? null : summaryGateStates[summaryState.kind];
  const gateCopy = summaryState.kind === "none" ? null : copy.gates[summaryState.kind];
  const isApproved = summaryState.kind === "approved";

  return (
    <div className="border-line-strong bg-surface shadow-card text-ink-soft rounded-2xl border p-5 text-sm leading-6 sm:p-6">
      <div className="flex items-center gap-2.5">
        <GateArch variant={gate?.arch ?? "open"} />
        <p className={cn("font-serif text-xl leading-snug font-medium", isApproved ? "text-brand-deep" : "text-ink")}>
          {copy.title}
        </p>
      </div>

      {/* Jedno zdanie zamiast trzech: co to jest i że pamięć rozmów nie czeka na ten krok. */}
      <p className="text-ink-muted mt-2">{copy.intro}</p>

      {summaryState.kind !== "none" && gate && gateCopy ? (
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
              {gateCopy.badge}
            </span>
            <span className="text-ink-muted">{gateCopy.consequence}</span>
          </div>
        </>
      ) : null}

      {summaryErrorCode ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 flex gap-2 rounded-xl border p-3">
          <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
          <p>{copy.errors[summaryErrorCode]}</p>
        </div>
      ) : null}

      {!canSummarize ? <p className="text-ink-muted mt-3">{copy.notSummarizable}</p> : null}

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
            {copy.generate}
          </button>
        ) : (
          <>
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
              {copy.rewrite}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
