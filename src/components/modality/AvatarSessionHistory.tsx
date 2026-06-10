import { useState } from "react";
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
import SessionHistoryDetailPanel from "./SessionHistoryDetail";
import SessionHistoryList from "./SessionHistoryList";

interface AvatarSessionHistoryProps {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  onPageChange: (page: number) => void;
  initialHistory?: SessionHistoryListResponse | null;
  initialDetail?: SessionHistoryDetail | null;
  initialConfirmSessionId?: string | null;
}

const errorCopy: Record<SessionHistoryFailureCode, string> = {
  missing_auth: "Musisz być zalogowany, żeby zobaczyć historię rozmów.",
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
}: AvatarSessionHistoryProps) {
  const [notice, setNotice] = useState<string | null>(null);

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
  const canSummarizeDetail =
    detail !== null &&
    detail.messages.length > 0 &&
    (detail.session.status === "completed" ||
      detail.session.status === "expired" ||
      detail.session.status === "interrupted");

  return (
    <section className="mt-8 rounded-lg border border-[#c8ddd7] bg-white p-5 shadow-[0_18px_46px_rgba(24,78,70,0.10)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#1f6f65]">Historia rozmów</p>
          <h2 className="mt-1 text-xl font-semibold text-[#10231f]">
            {selectedAvatar ? selectedAvatar.avatarName : "Wybierz awatara"}
          </h2>
          {selectedAvatar ? (
            <p className="mt-1 text-sm font-medium text-[#1f6f65]">{selectedAvatar.modalityName}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void refreshHistory();
            }}
            disabled={!selectedAvatar || history.status === "loading"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#9cc8bc] bg-white text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

      <p className="mt-3 text-sm leading-6 text-[#52645f]">
        Lista pokazuje tylko datę, status i czas trwania. Treść rozmowy pojawia się dopiero po otwarciu szczegółów.
      </p>

      {!selectedAvatar ? (
        <div className="mt-5 rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4 text-sm leading-6 text-[#52645f]">
          Wybierz awatara, żeby zobaczyć zapisane rozmowy dla tej perspektywy.
        </div>
      ) : null}

      {notice ? (
        <div className="mt-5 rounded-lg border border-[#c8ddd7] bg-[#f8fcfa] p-4 text-sm leading-6 text-[#38524b]">
          {notice}
        </div>
      ) : null}

      {history.status === "error" && history.errorCode ? (
        <div className="mt-5 rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-4 text-sm leading-6 text-[#7d2d2d]">
          {errorCopy[history.errorCode]}
        </div>
      ) : null}

      {history.status === "loading" && history.items.length === 0 && selectedAvatar ? (
        <div className="mt-5 flex min-h-32 items-center justify-center rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] text-sm text-[#52645f]">
          <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
          Ładowanie historii
        </div>
      ) : null}

      {history.status === "ready" && history.items.length === 0 ? (
        <div className="mt-5 rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4 text-sm leading-6 text-[#52645f]">
          Brak zapisanych rozmów dla tego awatara.
        </div>
      ) : null}

      {history.items.length > 0 ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
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

      {selectedAvatar ? (
        <div className="mt-5 flex flex-col gap-3 border-t border-[#e3eeea] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#52645f]">Strona {activePage}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canGoBack || history.status === "loading"}
              onClick={() => {
                changePage(activePage - 1);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-3 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-3 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
