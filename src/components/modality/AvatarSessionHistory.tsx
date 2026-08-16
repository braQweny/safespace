import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCw } from "lucide-react";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail } from "@/lib/session-data/types";
import type {
  SessionHistoryFailureCode,
  SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";
import { useSessionDeletion } from "@/components/hooks/useSessionDeletion";
import { useSessionHistoryDetail } from "@/components/hooks/useSessionHistoryDetail";
import { useSessionHistoryList } from "@/components/hooks/useSessionHistoryList";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { cn } from "@/lib/utils";
import SessionHistoryDetailPanel from "./SessionHistoryDetail";
import SessionHistoryList from "./SessionHistoryList";

interface AvatarSessionHistoryProps {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  onPageChange: (page: number) => void;
  initialHistory?: SessionHistoryListResponse | null;
  initialDetail?: SessionHistoryDetail | null;
  initialConfirmSessionId?: string | null;
  /** Session to open on mount, so a link from a finished session lands on its summary. */
  autoOpenSessionId?: string | null;
  /**
   * The avatar picker switches history per card, so it needs the name in the
   * heading. The dashboard already shows the same name right above and would
   * just repeat it.
   */
  showAvatarHeading?: boolean;
}

const errorCopy: Record<SessionHistoryFailureCode, string> = {
  missing_auth: "Zaloguj się, żeby zobaczyć historię rozmów.",
  invalid_avatar: "Nie udało się rozpoznać wybranego awatara.",
  invalid_page: "Nieprawidłowy numer strony historii.",
  session_not_found: "Nie znaleziono tej rozmowy albo została już usunięta.",
  read_failed: "Nie udało się odczytać historii. Spróbuj ponownie za chwilę.",
  delete_failed: "Nie udało się usunąć rozmowy. Spróbuj ponownie za chwilę.",
  session_data_unavailable: "Historia rozmów jest chwilowo niedostępna.",
  account_blocked: "Konto jest zablokowane.",
  account_access_unavailable: "Nie udało się zweryfikować dostępu do konta. Spróbuj ponownie.",
};

export default function AvatarSessionHistory({
  selectedAvatar,
  page,
  onPageChange,
  initialHistory = null,
  initialDetail = null,
  initialConfirmSessionId = null,
  autoOpenSessionId = null,
  showAvatarHeading = true,
}: AvatarSessionHistoryProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const autoOpenedRef = useRef(false);

  const { history, refreshHistory, removeHistoryItem } = useSessionHistoryList({
    selectedAvatar,
    page,
    initialHistory,
  });

  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary, syncSummary, resetSummary } =
    useSessionSummary(initialDetail?.summary ?? null);

  const { detail, detailStatus, openDetail, clearDetail } = useSessionHistoryDetail({
    initialDetail,
    onDetailLoaded: (loadedDetail) => {
      syncSummary(loadedDetail.summary);
    },
    onDetailError: (code) => {
      resetSummary();
      setNotice(errorCopy[code]);
    },
  });

  const { pendingDeleteId, deletingId, requestDelete, cancelDelete, confirmDelete } = useSessionDeletion({
    initialConfirmSessionId,
    onDeleted: async (sessionId) => {
      setNotice("Zapis rozmowy został usunięty.");
      removeHistoryItem(sessionId);

      if (detail?.session.id === sessionId) {
        clearDetail();
        resetSummary();
      }

      if (selectedAvatar) {
        await refreshHistory();
      }
    },
    onDeleteError: (code) => {
      setNotice(errorCopy[code]);
    },
  });

  function handleOpenDetail(sessionId: string) {
    setNotice(null);
    void openDetail(sessionId);
  }

  // A session that just ended links straight here; opening it by hand again
  // would defeat the point of the link.
  useEffect(() => {
    if (autoOpenedRef.current || !autoOpenSessionId || !selectedAvatar) {
      return;
    }

    // `openDetail` is a fresh reference each render, so this effect re-runs; the
    // ref guard is what keeps it to a single fetch.
    autoOpenedRef.current = true;
    void openDetail(autoOpenSessionId);
  }, [autoOpenSessionId, selectedAvatar, openDetail]);

  // On narrow screens the detail panel renders below a list that can be taller
  // than the viewport, so opening a conversation looked like nothing happened.
  useEffect(() => {
    if (!detail) {
      return;
    }

    detailPanelRef.current?.scrollIntoView({
      block: "nearest",
      behavior:
        typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }, [detail]);

  function handleConfirmDelete(sessionId: string) {
    setNotice(null);
    void confirmDelete(sessionId);
  }

  function handleGenerateSummary() {
    if (!detail) {
      return;
    }

    void generateSummary(detail.session.id);
  }

  function handleApproveSummary() {
    if (!detail) {
      return;
    }

    void approveSummary(detail.session.id);
  }

  function changePage(nextPage: number) {
    if (nextPage < 1) {
      return;
    }

    onPageChange(nextPage);
  }

  const activePage = history.pagination?.page ?? page;
  const canGoBack = history.pagination?.hasPreviousPage ?? activePage > 1;
  const canGoForward = history.pagination?.hasNextPage ?? false;
  // Panel podglądu pojawia się dopiero po otwarciu rozmowy — pusta kolumna obok listy
  // tylko zabierała miejsce.
  const showDetailPanel = detail !== null || detailStatus === "loading";
  const showPagination = canGoBack || canGoForward;
  const canSummarizeDetail =
    detail !== null &&
    detail.messages.length > 0 &&
    (detail.session.status === "completed" ||
      detail.session.status === "expired" ||
      detail.session.status === "interrupted");

  return (
    <section className="border-line-strong mt-8 rounded-lg border bg-white p-5 shadow-[0_18px_46px_rgba(24,78,70,0.10)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {showAvatarHeading ? (
            <>
              <p className="text-brand text-sm font-medium">Historia rozmów</p>
              <h2 className="text-ink mt-1 text-xl font-semibold">
                {selectedAvatar ? selectedAvatar.avatarName : "Wybierz awatara"}
              </h2>
              {selectedAvatar ? (
                <p className="text-brand mt-1 text-sm font-medium">{selectedAvatar.modalityName}</p>
              ) : null}
            </>
          ) : (
            <h2 className="text-ink text-xl font-semibold">Historia rozmów</h2>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshHistory();
            }}
            disabled={!selectedAvatar || history.status === "loading"}
            className="border-line-accent text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-white transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Odśwież historię"
            title="Odśwież historię"
          >
            {history.status === "loading" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <p className="text-ink-muted mt-3 text-sm leading-6">
        Lista pokazuje tylko datę, status i czas trwania. Treść rozmowy pojawia się dopiero po otwarciu szczegółów.
      </p>

      {!selectedAvatar ? (
        <div className="border-line bg-surface-soft text-ink-muted mt-5 rounded-lg border p-4 text-sm leading-6">
          Wybierz awatara, żeby zobaczyć zapisane rozmowy dla tej perspektywy.
        </div>
      ) : null}

      {notice ? (
        <div className="border-line-strong bg-surface-soft text-ink-soft mt-5 rounded-lg border p-4 text-sm leading-6">
          {notice}
        </div>
      ) : null}

      {history.status === "error" && history.errorCode ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-5 rounded-lg border p-4 text-sm leading-6">
          {errorCopy[history.errorCode]}
        </div>
      ) : null}

      {history.status === "loading" && history.items.length === 0 && selectedAvatar ? (
        <div className="border-line bg-surface-soft text-ink-muted mt-5 flex min-h-32 items-center justify-center rounded-lg border text-sm">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Ładowanie historii
        </div>
      ) : null}

      {history.status === "ready" && history.items.length === 0 ? (
        <div className="border-line bg-surface-soft text-ink-muted mt-5 rounded-lg border p-4 text-sm leading-6">
          Brak zapisanych rozmów dla tego awatara.
        </div>
      ) : null}

      {history.items.length > 0 ? (
        <div className={cn("mt-5 grid gap-3", showDetailPanel && "lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]")}>
          <SessionHistoryList
            items={history.items.slice(0, 20)}
            selectedSessionId={detail?.session.id ?? null}
            pendingDeleteId={pendingDeleteId}
            deletingId={deletingId}
            onOpenDetail={handleOpenDetail}
            onRequestDelete={requestDelete}
            onCancelDelete={cancelDelete}
            onConfirmDelete={handleConfirmDelete}
          />

          {showDetailPanel ? (
            <div ref={detailPanelRef}>
              <SessionHistoryDetailPanel
                detail={detail}
                detailStatus={detailStatus}
                selectedAvatar={selectedAvatar}
                summaryState={summaryState}
                summaryStatus={summaryStatus}
                summaryErrorCode={summaryErrorCode}
                canSummarize={canSummarizeDetail}
                onGenerateSummary={handleGenerateSummary}
                onApproveSummary={handleApproveSummary}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedAvatar && showPagination ? (
        <div className="border-line mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-ink-muted text-sm">Strona {activePage}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canGoBack || history.status === "loading"}
              onClick={() => {
                changePage(activePage - 1);
              }}
              className="border-line-accent text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Poprzednia
            </button>
            <button
              type="button"
              disabled={!canGoForward || history.status === "loading"}
              onClick={() => {
                changePage(activePage + 1);
              }}
              className="border-line-accent text-brand hover:bg-surface-hover focus:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              Następna
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
