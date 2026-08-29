import { useMemo } from "react";
import { Loader2, X } from "lucide-react";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";
import type { UiSessionMessage } from "@/lib/session-flow/message-state";
import type { SessionHistoryDetailStatus } from "@/components/hooks/useSessionHistoryDetail";
import type { SessionSummaryStatus } from "@/components/hooks/useSessionSummary";
import SessionMessages from "@/components/session/SessionMessages";
import SessionSummaryPanel from "./SessionSummaryPanel";

interface SessionHistoryDetailPanelProps {
  detail: SessionHistoryDetail | null;
  detailStatus: SessionHistoryDetailStatus;
  selectedAvatar: SelectedModalityAvatar | null;
  summaryState: SessionHistoryDetail["summary"];
  summaryStatus: SessionSummaryStatus;
  summaryErrorCode: SessionSummaryFailureCode | null;
  canSummarize: boolean;
  onGenerateSummary: () => void;
  onApproveSummary: () => void;
  /** Zamyka podgląd — rodzic czyści stan szczegółu i oddaje fokus liście. */
  onClose: () => void;
}

function toUiMessages(detail: SessionHistoryDetail): UiSessionMessage[] {
  return detail.messages.map((message) => ({
    id: message.id,
    role: message.role,
    sequenceIndex: message.sequenceIndex,
    content: message.content,
    createdAt: message.createdAt,
  }));
}

export default function SessionHistoryDetailPanel({
  detail,
  detailStatus,
  selectedAvatar,
  summaryState,
  summaryStatus,
  summaryErrorCode,
  canSummarize,
  onGenerateSummary,
  onApproveSummary,
  onClose,
}: SessionHistoryDetailPanelProps) {
  const detailMessages = useMemo(() => (detail ? toUiMessages(detail) : []), [detail]);

  return (
    <aside className="bg-surface-soft rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-ink font-serif text-lg leading-snug font-medium">Podgląd tylko do odczytu</p>
        <button
          type="button"
          onClick={onClose}
          className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring -mt-1 -mr-1 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          Zamknij podgląd
        </button>
      </div>
      <p className="text-ink-muted mt-1 text-sm leading-6">
        Ten widok nie pozwala wysyłać wiadomości, ponawiać odpowiedzi ani restartować czasu sesji.
      </p>

      {detailStatus === "loading" ? (
        <div className="bg-surface text-ink-muted mt-4 flex min-h-32 items-center justify-center rounded-xl text-sm">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Ładowanie rozmowy
        </div>
      ) : null}

      {detailStatus === "error" ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-xl border p-4 text-sm leading-6">
          Nie udało się otworzyć tej rozmowy.
        </div>
      ) : null}

      {detail && selectedAvatar ? (
        <div className="mt-4 space-y-4">
          <SessionSummaryPanel
            summaryState={summaryState}
            summaryStatus={summaryStatus}
            summaryErrorCode={summaryErrorCode}
            canSummarize={canSummarize}
            onGenerate={onGenerateSummary}
            onApprove={onApproveSummary}
          />
          {/*
            Wewnętrzny scroll tylko w układzie obok listy (`@3xl:` z `@container`
            sekcji) — na wąskim kontenerze panel stoi pod listą i rozmowa płynie
            w stronie, bez scrolla w scrollu.
          */}
          <div className="@3xl:max-h-[70vh] @3xl:overflow-y-auto">
            <SessionMessages
              messages={detailMessages}
              assistantAvatar={selectedAvatar}
              emptyCopy="Ta rozmowa nie ma zapisanych wiadomości."
            />
          </div>
        </div>
      ) : detailStatus === "idle" ? (
        <div className="bg-surface text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">
          Otwórz rozmowę z listy, żeby zobaczyć pełny zapis tylko do odczytu.
        </div>
      ) : null}
    </aside>
  );
}
