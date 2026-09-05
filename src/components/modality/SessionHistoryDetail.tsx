import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import { getModalityCopy } from "@/lib/modality-copy";
import type { SessionHistoryDetail } from "@/lib/session-data/types";
import type { SessionSummaryFailureCode } from "@/lib/session-flow/session-summary-contract";
import type { UiSessionMessage } from "@/lib/session-flow/message-state";
import type { SessionHistoryDetailStatus } from "@/components/hooks/useSessionHistoryDetail";
import type { SessionSummaryStatus } from "@/components/hooks/useSessionSummary";
import SessionMessages from "@/components/session/SessionMessages";
import SessionSummaryPanel from "./SessionSummaryPanel";
import { getSessionHistoryCopy } from "./session-history-copy";

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
  /**
   * Usuwanie żyje tutaj, a nie na liście: kasowanie zapisu, którego się nie
   * widzi, przy wierszach różniących się samą godziną było proszeniem się o
   * pomyłkę.
   */
  isConfirmingDelete: boolean;
  isDeleting: boolean;
  onRequestDelete: (sessionId: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (sessionId: string) => void;
}

const DELETE_CONFIRM_HEADING_ID = "session-history-delete-heading";

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
  isConfirmingDelete,
  isDeleting,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: SessionHistoryDetailPanelProps) {
  const locale = useLocale();
  const copy = getSessionHistoryCopy(locale).detail;
  const detailMessages = useMemo(() => (detail ? toUiMessages(detail) : []), [detail]);
  const confirmDeleteRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);

  // Blok potwierdzenia pojawia się poza fokusem — bez przeniesienia fokusu
  // czytnik ekranu nie dowiedziałby się, że coś wymaga decyzji.
  useEffect(() => {
    if (isConfirmingDelete) {
      confirmDeleteRef.current?.focus();
    }
  }, [isConfirmingDelete]);

  function handleCancelDelete() {
    onCancelDelete();
    deleteButtonRef.current?.focus();
  }

  function handleConfirmKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleCancelDelete();
  }

  return (
    <div className="bg-surface rounded-2xl p-4 sm:p-6">
      <div className="border-line bg-surface sticky top-0 z-10 -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6">
        <h2 className="text-ink font-serif text-xl leading-snug font-medium">{copy.title}</h2>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-2">
          {detail ? (
            <button
              ref={deleteButtonRef}
              type="button"
              onClick={() => {
                onRequestDelete(detail.session.id);
              }}
              className="text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:ring-danger-strong inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {copy.deleteConversation}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
          >
            <X aria-hidden="true" className="h-4 w-4" />
            {copy.close}
          </button>
        </div>
      </div>
      <p className="text-ink-muted mt-4 text-sm leading-6">
        {selectedAvatar ? `${getModalityCopy(locale, selectedAvatar.modalityId).avatarName} · ` : null}
        {copy.readOnly}
      </p>

      {detail && isConfirmingDelete ? (
        <div
          ref={confirmDeleteRef}
          role="group"
          aria-labelledby={DELETE_CONFIRM_HEADING_ID}
          tabIndex={-1}
          onKeyDown={handleConfirmKeyDown}
          className="border-line-accent bg-surface text-ink-soft mt-4 rounded-xl border p-4 text-sm leading-6 focus:outline-none"
        >
          <p id={DELETE_CONFIRM_HEADING_ID} className="font-semibold">
            {copy.confirmDeleteTitle}
          </p>
          <p className="mt-1">{copy.confirmDeleteBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCancelDelete}
              className="border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                onConfirmDelete(detail.session.id);
              }}
              className="bg-danger text-surface hover:bg-danger-strong focus-visible:ring-danger-strong disabled:bg-danger-line inline-flex h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
            >
              {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {copy.confirmDelete}
            </button>
          </div>
        </div>
      ) : null}

      {detailStatus === "loading" ? (
        <div className="bg-surface text-ink-muted mt-4 flex min-h-32 items-center justify-center rounded-xl text-sm">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          {copy.loadingConversation}
        </div>
      ) : null}

      {detailStatus === "error" ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-xl border p-4 text-sm leading-6">
          {copy.openFailed}
        </div>
      ) : null}

      {detail && selectedAvatar ? (
        <div className="mt-4 space-y-4">
          <details className="border-line rounded-xl border px-4">
            <summary className="text-brand focus-visible:ring-brand-ring min-h-11 cursor-pointer rounded py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2">
              {copy.summaryDisclosure}
            </summary>
            <SessionSummaryPanel
              summaryState={summaryState}
              summaryStatus={summaryStatus}
              summaryErrorCode={summaryErrorCode}
              canSummarize={canSummarize}
              onGenerate={onGenerateSummary}
              onApprove={onApproveSummary}
            />
          </details>
          <div>
            <SessionMessages
              messages={detailMessages}
              assistantAvatar={selectedAvatar}
              emptyCopy={copy.emptyTranscript}
            />
          </div>
        </div>
      ) : detailStatus === "idle" ? (
        <div className="bg-surface text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">{copy.idleHint}</div>
      ) : null}
    </div>
  );
}
