import { useMemo } from "react";
import { Loader2 } from "lucide-react";
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
}: SessionHistoryDetailPanelProps) {
  const detailMessages = useMemo(() => (detail ? toUiMessages(detail) : []), [detail]);

  return (
    <aside className="border-line bg-surface-soft rounded-lg border p-4">
      <p className="text-ink text-sm font-semibold">Podgląd tylko do odczytu</p>
      <p className="text-ink-muted mt-1 text-sm leading-6">
        Ten widok nie pozwala wysyłać wiadomości, ponawiać odpowiedzi ani restartować czasu sesji.
      </p>

      {detailStatus === "loading" ? (
        <div className="border-line text-ink-muted mt-4 flex min-h-32 items-center justify-center rounded-lg border bg-white text-sm">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Ładowanie rozmowy
        </div>
      ) : null}

      {detailStatus === "error" ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-lg border p-4 text-sm leading-6">
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
          <div className="max-h-[70vh] overflow-y-auto">
            <SessionMessages
              messages={detailMessages}
              assistantAvatar={selectedAvatar}
              emptyCopy="Ta rozmowa nie ma zapisanych wiadomości."
            />
          </div>
        </div>
      ) : detailStatus === "idle" ? (
        <div className="border-line text-ink-muted mt-4 rounded-lg border bg-white p-4 text-sm leading-6">
          Otwórz rozmowę z listy, żeby zobaczyć pełny zapis tylko do odczytu.
        </div>
      ) : null}
    </aside>
  );
}
