import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type {
  SessionHistoryFailureCode,
  SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useSessionDeletion } from "@/components/hooks/useSessionDeletion";
import { useSessionHistoryDetail } from "@/components/hooks/useSessionHistoryDetail";
import { useSessionHistoryList } from "@/components/hooks/useSessionHistoryList";
import { useSessionSummary } from "@/components/hooks/useSessionSummary";
import { cn } from "@/lib/utils";
import SessionHistoryDetailPanel from "./SessionHistoryDetail";
import SessionHistoryList, { getOpenDetailButtonId } from "./SessionHistoryList";

interface AvatarSessionHistoryProps {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  onPageChange: (page: number) => void;
  initialHistory?: SessionHistoryListResponse | null;
  /** Session to open on mount, so a link from a finished session lands on its summary. */
  autoOpenSessionId?: string | null;
  /** Sterowanie zakresem listy (np. przełącznik perspektywy) renderowane w nagłówku sekcji. */
  controls?: ReactNode;
  /** Stała informacja o zakresie listy, niezależna od komunikatów operacji. */
  contextNotice?: string | null;
  /** Pozwala stronie sterować odstępem sekcji, gdy historia stoi w kolumnie obok wyboru awatara. */
  className?: string;
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

export default function AvatarSessionHistory(props: AvatarSessionHistoryProps) {
  const { selectedAvatar, controls, className } = props;
  return (
    <section
      className={cn("border-line-strong bg-surface shadow-card mt-8 rounded-[20px] border p-5 sm:p-6", className)}
    >
      <div className="space-y-4">
        <div>
          <h2 id="history-title" tabIndex={-1} className="text-ink font-serif text-2xl leading-tight font-medium">
            Historia rozmów
          </h2>
          {selectedAvatar ? <p className="text-ink-muted mt-1 text-sm">{selectedAvatar.avatarName}</p> : null}
        </div>
        {controls}
      </div>
      {/* Tylko dane są odmontowywane: radia filtra zachowują fokus przy zmianie. */}
      <SessionHistoryContent key={`${selectedAvatar?.avatarId ?? "none"}:${props.page}`} {...props} />
    </section>
  );
}

function SessionHistoryContent({
  selectedAvatar,
  page,
  onPageChange,
  initialHistory = null,
  autoOpenSessionId = null,
  contextNotice = null,
}: AvatarSessionHistoryProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const isHydrated = useIsHydrated();
  const detailPanelRef = useRef<HTMLDialogElement | null>(null);
  const autoOpenedRef = useRef(false);
  // Ostatnio żądana rozmowa — po zamknięciu podglądu fokus wraca na jej wiersz,
  // także gdy podgląd zamknięto jeszcze w trakcie ładowania (detail === null).
  const requestedSessionIdRef = useRef<string | null>(null);

  const { history, refreshHistory, removeHistoryItem } = useSessionHistoryList({
    selectedAvatar,
    page,
    initialHistory,
  });

  // Podgląd i podsumowanie zaczynają puste: rozmowę otwiera się świadomie z
  // listy (albo z linku po zakończonej sesji przez `autoOpenSessionId`), więc
  // serwer nigdy nie wkłada treści rozmowy w pierwszy render tej sekcji.
  const { summaryState, summaryStatus, summaryErrorCode, generateSummary, approveSummary, syncSummary, resetSummary } =
    useSessionSummary();

  const { detail, detailStatus, openDetail, clearDetail } = useSessionHistoryDetail({
    onDetailLoaded: (loadedDetail) => {
      syncSummary(loadedDetail.summary);
    },
    onDetailError: (code) => {
      resetSummary();
      setNotice(errorCopy[code]);
    },
  });

  const { pendingDeleteId, deletingId, requestDelete, cancelDelete, confirmDelete } = useSessionDeletion({
    onDeleted: async (sessionId) => {
      setNotice("Zapis rozmowy został usunięty.");
      removeHistoryItem(sessionId);

      if (detail?.session.id === sessionId) {
        detailPanelRef.current?.close();
        clearDetail();
        resetSummary();
        document.getElementById("history-title")?.focus({ preventScroll: true });
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
    requestedSessionIdRef.current = sessionId;
    void openDetail(sessionId);
  }

  // Panel znika z DOM razem z podglądem, więc fokus trzeba oddać świadomie —
  // na przycisk „Otwórz” tej samej rozmowy, zanim React zdąży odmontować panel.
  function handleCloseDetail() {
    const sessionId = detail?.session.id ?? requestedSessionIdRef.current;

    detailPanelRef.current?.close();
    cancelDelete();
    clearDetail();
    resetSummary();

    if (sessionId) {
      document.getElementById(getOpenDetailButtonId(sessionId))?.focus({ preventScroll: true });
    }
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
    requestedSessionIdRef.current = autoOpenSessionId;
    void openDetail(autoOpenSessionId);
  }, [autoOpenSessionId, selectedAvatar, openDetail]);

  const showDetailPanel = detail !== null || detailStatus === "loading";

  useEffect(() => {
    const dialog = detailPanelRef.current;
    if (!showDetailPanel || !dialog) return;

    dialog.showModal();
    dialog.focus();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [showDetailPanel]);

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
  const showPagination = canGoBack || canGoForward;
  const canSummarizeDetail =
    detail !== null &&
    detail.messages.length > 0 &&
    (detail.session.status === "completed" ||
      detail.session.status === "expired" ||
      detail.session.status === "interrupted");

  return (
    <>
      {/*
        Bez zdania wstępu i bez legendy statusów: wiersz mówi „Po czasie” albo
        „Przerwana” sam, a plakietka niesie pełne wyjaśnienie w `title`. Panel
        tłumaczył się w tym miejscu jako trzecim z kolei.
      */}
      {contextNotice ? (
        <div className="bg-brand-tint text-brand-deep mt-4 rounded-xl p-3.5 text-sm leading-6">{contextNotice}</div>
      ) : null}

      {!selectedAvatar ? (
        <div className="bg-surface-soft text-ink-muted mt-5 rounded-xl p-4 text-sm leading-6">
          Wybierz perspektywę, żeby zobaczyć jej zapisane rozmowy.
        </div>
      ) : null}

      {notice ? (
        <div className="bg-surface-soft text-ink-soft mt-5 rounded-xl p-4 text-sm leading-6" role="status">
          {notice}
        </div>
      ) : null}

      {history.status === "error" && history.errorCode ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-5 rounded-xl border p-4 text-sm leading-6">
          {errorCopy[history.errorCode]}
        </div>
      ) : null}

      {history.status === "loading" && history.items.length === 0 && selectedAvatar ? (
        <div className="bg-surface-soft text-ink-muted mt-5 flex min-h-32 items-center justify-center rounded-xl text-sm">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Ładowanie historii
        </div>
      ) : null}

      {history.status === "ready" && history.items.length === 0 ? (
        <div className="bg-surface-soft text-ink-muted mt-5 rounded-xl p-4 text-sm leading-6">
          Brak zapisanych rozmów dla tej perspektywy.
        </div>
      ) : null}

      {history.items.length > 0 ? (
        <div className="mt-4">
          <SessionHistoryList
            items={history.items.slice(0, 20)}
            selectedSessionId={detail?.session.id ?? null}
            isInteractive={isHydrated}
            onOpenDetail={handleOpenDetail}
          />
        </div>
      ) : null}

      {showDetailPanel ? (
        <dialog
          ref={detailPanelRef}
          aria-label="Zapis rozmowy"
          tabIndex={-1}
          onCancel={(event) => {
            event.preventDefault();
            handleCloseDetail();
          }}
          className="border-line-strong bg-surface text-ink fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border p-0 backdrop:bg-black/50"
        >
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
            onClose={handleCloseDetail}
            isConfirmingDelete={detail !== null && pendingDeleteId === detail.session.id}
            isDeleting={detail !== null && deletingId === detail.session.id}
            onRequestDelete={requestDelete}
            onCancelDelete={cancelDelete}
            onConfirmDelete={handleConfirmDelete}
          />
        </dialog>
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
              className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
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
              className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Następna
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
