import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  MessageSquareText,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail, SessionHistoryListItem, SessionHistoryPagination } from "@/lib/session-data/types";
import type {
  SessionHistoryDeleteResponse,
  SessionHistoryDetailResponse,
  SessionHistoryFailureCode,
  SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";
import type {
  SessionSummaryApproveResponse,
  SessionSummaryFailureCode,
  SessionSummaryGenerateResponse,
  SessionSummaryResponse,
} from "@/lib/session-flow/session-summary-contract";
import type { UiSessionMessage } from "@/lib/session-flow/message-state";
import { cn } from "@/lib/utils";
import SessionMessages from "@/components/session/SessionMessages";

interface AvatarSessionHistoryProps {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  onPageChange: (page: number) => void;
  initialHistory?: SessionHistoryListResponse | null;
  initialDetail?: SessionHistoryDetail | null;
  initialConfirmSessionId?: string | null;
}

type HistoryStatus = "idle" | "loading" | "ready" | "error";

interface HistoryState {
  status: HistoryStatus;
  items: SessionHistoryListItem[];
  pagination: SessionHistoryPagination | null;
  errorCode: SessionHistoryFailureCode | null;
}

const statusLabels: Record<SessionHistoryListItem["status"], string> = {
  created: "Utworzona",
  active: "Aktywna",
  completed: "Zakończona",
  expired: "Po czasie",
  interrupted: "Przerwana",
};

const errorCopy: Record<SessionHistoryFailureCode, string> = {
  missing_auth: "Musisz być zalogowany, żeby zobaczyć historię rozmów.",
  invalid_avatar: "Nie udało się rozpoznać wybranego awatara.",
  invalid_page: "Nieprawidłowy numer strony historii.",
  session_not_found: "Nie znaleziono tej rozmowy albo została już usunięta.",
  read_failed: "Nie udało się odczytać historii. Spróbuj ponownie za chwilę.",
  delete_failed: "Nie udało się usunąć rozmowy. Spróbuj ponownie za chwilę.",
  session_data_unavailable: "Historia rozmów jest chwilowo niedostępna.",
};

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
};

function getHistoryKey(avatarId: string | null, page: number) {
  return avatarId ? `${avatarId}:${page}` : null;
}

function isListSuccess(
  response: SessionHistoryListResponse,
): response is Extract<SessionHistoryListResponse, { ok: true }> {
  return response.ok;
}

function isDetailSuccess(
  response: SessionHistoryDetailResponse,
): response is Extract<SessionHistoryDetailResponse, { ok: true }> {
  return response.ok;
}

function isDeleteSuccess(
  response: SessionHistoryDeleteResponse,
): response is Extract<SessionHistoryDeleteResponse, { ok: true }> {
  return response.ok;
}

function isSummaryGeneratedSuccess(
  response: SessionSummaryResponse,
): response is Extract<SessionSummaryResponse, { type: "session_summary_generated" }> {
  return response.ok && response.type === "session_summary_generated";
}

function isSummaryApprovedSuccess(
  response: SessionSummaryResponse,
): response is Extract<SessionSummaryResponse, { type: "session_summary_approved" }> {
  return response.ok && response.type === "session_summary_approved";
}

function getInitialState(
  selectedAvatar: SelectedModalityAvatar | null,
  page: number,
  initialHistory?: SessionHistoryListResponse | null,
): HistoryState {
  if (!selectedAvatar) {
    return {
      status: "idle",
      items: [],
      pagination: null,
      errorCode: null,
    };
  }

  if (
    initialHistory &&
    isListSuccess(initialHistory) &&
    initialHistory.avatar.avatarId === selectedAvatar.avatarId &&
    initialHistory.pagination.page === page
  ) {
    return {
      status: "ready",
      items: initialHistory.items.slice(0, 20),
      pagination: initialHistory.pagination,
      errorCode: null,
    };
  }

  if (initialHistory && !initialHistory.ok) {
    return {
      status: "error",
      items: [],
      pagination: {
        page,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: page > 1,
      },
      errorCode: initialHistory.code,
    };
  }

  return {
    status: "loading",
    items: [],
    pagination: {
      page,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    },
    errorCode: null,
  };
}

async function readJson<T>(response: Response) {
  const body: unknown = await response.json();
  return body as T;
}

function formatDateTime(timestamp: string | null) {
  if (!timestamp) {
    return "Brak daty";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Brak daty";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(date);
}

function getDurationLabel(item: SessionHistoryListItem) {
  if (typeof item.durationBucketSeconds === "number" && item.durationBucketSeconds > 0) {
    return `${Math.round(item.durationBucketSeconds / 60)} min`;
  }

  if (item.startedAt && item.endedAt) {
    const started = Date.parse(item.startedAt);
    const ended = Date.parse(item.endedAt);

    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      return `${Math.max(1, Math.round((ended - started) / 60_000))} min`;
    }
  }

  return "Czas nieustalony";
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

export default function AvatarSessionHistory({
  selectedAvatar,
  page,
  onPageChange,
  initialHistory = null,
  initialDetail = null,
  initialConfirmSessionId = null,
}: AvatarSessionHistoryProps) {
  const selectedAvatarId = selectedAvatar?.avatarId ?? null;
  const initialKey =
    initialHistory?.ok &&
    selectedAvatarId &&
    initialHistory.avatar.avatarId === selectedAvatarId &&
    initialHistory.pagination.page === page
      ? getHistoryKey(selectedAvatarId, page)
      : null;
  const loadedKeyRef = useRef(initialKey);
  const [history, setHistory] = useState<HistoryState>(() => getInitialState(selectedAvatar, page, initialHistory));
  const [detail, setDetail] = useState<SessionHistoryDetail | null>(initialDetail);
  const [detailStatus, setDetailStatus] = useState<"idle" | "loading" | "error" | "ready">(
    initialDetail ? "ready" : "idle",
  );
  const [summaryState, setSummaryState] = useState<SessionHistoryDetail["summary"]>(
    initialDetail?.summary ?? {
      kind: "none",
    },
  );
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "generating" | "approving">("idle");
  const [summaryErrorCode, setSummaryErrorCode] = useState<SessionSummaryFailureCode | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(initialConfirmSessionId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const detailMessages = useMemo(() => (detail ? toUiMessages(detail) : []), [detail]);

  const loadHistory = useCallback(async (avatarId: string, nextPage: number, signal?: AbortSignal) => {
    const key = getHistoryKey(avatarId, nextPage);

    setHistory((current) => ({
      ...current,
      status: "loading",
      errorCode: null,
    }));

    try {
      const response = await fetch(
        `/api/session/history?avatar=${encodeURIComponent(avatarId)}&page=${encodeURIComponent(String(nextPage))}`,
        {
          headers: {
            Accept: "application/json",
          },
          signal,
        },
      );
      const body = await readJson<SessionHistoryListResponse>(response);

      if (!isListSuccess(body)) {
        setHistory({
          status: "error",
          items: [],
          pagination: {
            page: nextPage,
            pageSize: 20,
            hasNextPage: false,
            hasPreviousPage: nextPage > 1,
          },
          errorCode: body.code,
        });
        loadedKeyRef.current = key;
        return;
      }

      setHistory({
        status: "ready",
        items: body.items.slice(0, 20),
        pagination: body.pagination,
        errorCode: null,
      });
      loadedKeyRef.current = key;
    } catch {
      if (signal?.aborted) {
        return;
      }

      setHistory({
        status: "error",
        items: [],
        pagination: {
          page: nextPage,
          pageSize: 20,
          hasNextPage: false,
          hasPreviousPage: nextPage > 1,
        },
        errorCode: "read_failed",
      });
      loadedKeyRef.current = key;
    }
  }, []);

  useEffect(() => {
    const avatarId = selectedAvatar?.avatarId ?? null;
    const key = getHistoryKey(avatarId, page);

    if (!avatarId || !key) {
      loadedKeyRef.current = null;
      return;
    }

    if (loadedKeyRef.current === key) {
      return;
    }

    const controller = new AbortController();
    void loadHistory(avatarId, page, controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadHistory, page, selectedAvatar?.avatarId]);

  async function openDetail(sessionId: string) {
    setDetailStatus("loading");
    setNotice(null);

    try {
      const response = await fetch(`/api/session/history/${encodeURIComponent(sessionId)}`, {
        headers: {
          Accept: "application/json",
        },
      });
      const body = await readJson<SessionHistoryDetailResponse>(response);

      if (!isDetailSuccess(body)) {
        setDetail(null);
        setDetailStatus("error");
        setSummaryState({
          kind: "none",
        });
        setSummaryErrorCode(null);
        setNotice(errorCopy[body.code]);
        return;
      }

      setDetail(body.detail);
      setSummaryState(body.detail.summary);
      setSummaryErrorCode(null);
      setDetailStatus("ready");
    } catch {
      setDetail(null);
      setDetailStatus("error");
      setSummaryState({
        kind: "none",
      });
      setSummaryErrorCode(null);
      setNotice(errorCopy.read_failed);
    }
  }

  async function generateSummary() {
    if (!detail) {
      return;
    }

    setSummaryStatus("generating");
    setSummaryErrorCode(null);

    try {
      const response = await fetch(`/api/session/summary/${encodeURIComponent(detail.session.id)}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });
      const body = await readJson<SessionSummaryGenerateResponse>(response);

      if (!isSummaryGeneratedSuccess(body)) {
        setSummaryErrorCode(body.code);
        return;
      }

      setSummaryState({
        kind: "preview",
        summary: body.summary,
      });
    } catch {
      setSummaryErrorCode("provider_unavailable");
    } finally {
      setSummaryStatus("idle");
    }
  }

  async function approveSummary() {
    if (!detail || summaryState.kind === "none") {
      return;
    }

    setSummaryStatus("approving");
    setSummaryErrorCode(null);

    try {
      const response = await fetch(`/api/session/summary/${encodeURIComponent(detail.session.id)}`, {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          revision: summaryState.summary.revision,
        }),
      });
      const body = await readJson<SessionSummaryApproveResponse>(response);

      if (!isSummaryApprovedSuccess(body)) {
        setSummaryErrorCode(body.code);
        return;
      }

      setSummaryState({
        kind: "approved",
        summary: body.summary,
      });
    } catch {
      setSummaryErrorCode("approval_failed");
    } finally {
      setSummaryStatus("idle");
    }
  }

  async function confirmDelete(sessionId: string) {
    setDeletingId(sessionId);
    setNotice(null);

    try {
      const response = await fetch(`/api/session/history/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });
      const body = await readJson<SessionHistoryDeleteResponse>(response);

      if (!isDeleteSuccess(body)) {
        setNotice(errorCopy[body.code]);
        return;
      }

      setNotice("Zapis rozmowy został usunięty.");
      setPendingDeleteId(null);
      setHistory((current) => ({
        ...current,
        items: current.items.filter((item) => item.id !== sessionId),
      }));

      if (detail?.session.id === sessionId) {
        setDetail(null);
        setDetailStatus("idle");
        setSummaryState({
          kind: "none",
        });
        setSummaryErrorCode(null);
      }

      if (selectedAvatar) {
        loadedKeyRef.current = null;
        await loadHistory(selectedAvatar.avatarId, page);
      }
    } catch {
      setNotice(errorCopy.delete_failed);
    } finally {
      setDeletingId(null);
    }
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
  const summaryIsBusy = summaryStatus !== "idle";

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
              if (selectedAvatar) {
                loadedKeyRef.current = null;
                void loadHistory(selectedAvatar.avatarId, page);
              }
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
          <ol className="space-y-3">
            {history.items.slice(0, 20).map((item) => {
              const isSelected = detail?.session.id === item.id;
              const isConfirming = pendingDeleteId === item.id;
              const isDeleting = deletingId === item.id;

              return (
                <li
                  key={item.id}
                  data-history-item={item.id}
                  className={cn(
                    "rounded-lg border p-4 text-sm leading-6 transition-colors",
                    isSelected ? "border-[#1f6f65] bg-[#f4faf7]" : "border-[#d7e5e0] bg-white",
                  )}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-[#10231f]">{formatDateTime(item.startedAt ?? item.createdAt)}</p>
                      <p className="mt-1 text-[#52645f]">
                        {statusLabels[item.status]} · {getDurationLabel(item)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void openDetail(item.id);
                        }}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-3 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
                      >
                        <MessageSquareText aria-hidden="true" className="h-4 w-4" />
                        Otwórz
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingDeleteId(item.id);
                        }}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e2b8b8] bg-white px-3 text-sm font-medium text-[#7d2d2d] transition-colors hover:bg-[#fff8f8] focus:ring-2 focus:ring-[#c46d6d] focus:outline-none"
                      >
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                        Usuń
                      </button>
                    </div>
                  </div>

                  {isConfirming ? (
                    <div className="mt-4 rounded-lg border border-[#edd3a1] bg-[#fffaf0] p-4 text-sm leading-6 text-[#654b16]">
                      <p className="font-semibold">Potwierdź usunięcie rozmowy</p>
                      <p className="mt-1">
                        Usunięcie jest nieodwracalne. Treść rozmowy zostanie usunięta i nie przywraca darmowej próby.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPendingDeleteId(null);
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d7c38d] bg-white px-3 text-sm font-medium text-[#654b16] transition-colors hover:bg-[#fff6df] focus:ring-2 focus:ring-[#d6af53] focus:outline-none"
                        >
                          Anuluj
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => {
                            void confirmDelete(item.id);
                          }}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#7d2d2d] px-3 text-sm font-medium text-white transition-colors hover:bg-[#6b2424] focus:ring-2 focus:ring-[#c46d6d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#caa0a0]"
                        >
                          {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                          Potwierdź usunięcie
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          <aside className="rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4">
            <p className="text-sm font-semibold text-[#10231f]">Podgląd tylko do odczytu</p>
            <p className="mt-1 text-sm leading-6 text-[#52645f]">
              Ten widok nie pozwala wysyłać wiadomości, ponawiać odpowiedzi ani restartować czasu sesji.
            </p>

            {detailStatus === "loading" ? (
              <div className="mt-4 flex min-h-32 items-center justify-center rounded-lg border border-[#d7e5e0] bg-white text-sm text-[#52645f]">
                <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                Ładowanie rozmowy
              </div>
            ) : null}

            {detailStatus === "error" ? (
              <div className="mt-4 rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-4 text-sm leading-6 text-[#7d2d2d]">
                Nie udało się otworzyć tej rozmowy.
              </div>
            ) : null}

            {detail && selectedAvatar ? (
              <div className="mt-4 space-y-4">
                <SessionMessages
                  messages={detailMessages}
                  assistantAvatar={selectedAvatar}
                  emptyCopy="Ta rozmowa nie ma zapisanych wiadomości."
                />
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
                              Zobacz treść przed użyciem. Dopiero przycisk „Użyj w kolejnej sesji” pozwoli użyć tej
                              rewizji jako kontekstu.
                            </p>
                          ) : null}
                          {summaryState.kind === "stale" ? (
                            <p className="mt-2 text-[#52645f]">
                              Ta rewizja nie będzie używana jako kontekst kolejnej sesji.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {summaryErrorCode ? (
                        <div className="mt-3 flex gap-2 rounded-lg border border-[#f0c7c7] bg-[#fff8f8] p-3 text-[#7d2d2d]">
                          <AlertCircle aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
                          <p>{summaryErrorCopy[summaryErrorCode]}</p>
                        </div>
                      ) : null}
                      {!canSummarizeDetail ? (
                        <p className="mt-3 text-[#52645f]">Aktywne albo puste rozmowy nie mogą zostać podsumowane.</p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!canSummarizeDetail || summaryIsBusy}
                          onClick={() => {
                            void generateSummary();
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
                            void approveSummary();
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
              </div>
            ) : detailStatus === "idle" ? (
              <div className="mt-4 rounded-lg border border-[#d7e5e0] bg-white p-4 text-sm leading-6 text-[#52645f]">
                Otwórz rozmowę z listy, żeby zobaczyć pełny zapis tylko do odczytu.
              </div>
            ) : null}
          </aside>
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
