import { useCallback, useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryListItem, SessionHistoryPagination } from "@/lib/session-data/types";
import {
  isSessionHistoryFailure,
  isSessionHistoryListSuccess,
  type SessionHistoryFailureCode,
  type SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";

export type SessionHistoryListStatus = "idle" | "loading" | "ready" | "error";

export interface SessionHistoryListState {
  status: SessionHistoryListStatus;
  items: SessionHistoryListItem[];
  pagination: SessionHistoryPagination | null;
  errorCode: SessionHistoryFailureCode | null;
}

export const SESSION_HISTORY_PAGE_SIZE = 20;

function getHistoryKey(avatarId: string | null, page: number) {
  return avatarId ? `${avatarId}:${page}` : null;
}

function getFallbackPagination(page: number): SessionHistoryPagination {
  return {
    page,
    pageSize: SESSION_HISTORY_PAGE_SIZE,
    hasNextPage: false,
    hasPreviousPage: page > 1,
  };
}

export function getInitialHistoryState(
  selectedAvatar: SelectedModalityAvatar | null,
  page: number,
  initialHistory?: SessionHistoryListResponse | null,
): SessionHistoryListState {
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
    isSessionHistoryListSuccess(initialHistory) &&
    initialHistory.avatar.avatarId === selectedAvatar.avatarId &&
    initialHistory.pagination.page === page
  ) {
    return {
      status: "ready",
      items: initialHistory.items.slice(0, SESSION_HISTORY_PAGE_SIZE),
      pagination: initialHistory.pagination,
      errorCode: null,
    };
  }

  if (initialHistory && !initialHistory.ok) {
    return {
      status: "error",
      items: [],
      pagination: getFallbackPagination(page),
      errorCode: initialHistory.code,
    };
  }

  return {
    status: "loading",
    items: [],
    pagination: getFallbackPagination(page),
    errorCode: null,
  };
}

interface UseSessionHistoryListOptions {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  initialHistory?: SessionHistoryListResponse | null;
}

export function useSessionHistoryList({ selectedAvatar, page, initialHistory = null }: UseSessionHistoryListOptions) {
  const selectedAvatarId = selectedAvatar?.avatarId ?? null;
  const initialKey =
    initialHistory?.ok &&
    selectedAvatarId &&
    initialHistory.avatar.avatarId === selectedAvatarId &&
    initialHistory.pagination.page === page
      ? getHistoryKey(selectedAvatarId, page)
      : null;
  const loadedKeyRef = useRef(initialKey);
  const [history, setHistory] = useState<SessionHistoryListState>(() =>
    getInitialHistoryState(selectedAvatar, page, initialHistory),
  );

  const loadHistory = useCallback(async (avatarId: string, nextPage: number, signal?: AbortSignal) => {
    const key = getHistoryKey(avatarId, nextPage);

    setHistory((current) => ({
      ...current,
      status: "loading",
      errorCode: null,
    }));

    const result = await requestApiJson(
      `/api/session/history?avatar=${encodeURIComponent(avatarId)}&page=${encodeURIComponent(String(nextPage))}`,
      {
        signal,
      },
    );

    if (result.kind === "network_error") {
      if (signal?.aborted) {
        return;
      }

      setHistory({
        status: "error",
        items: [],
        pagination: getFallbackPagination(nextPage),
        errorCode: "read_failed",
      });
      loadedKeyRef.current = key;
      return;
    }

    const body = result.body;

    if (!isSessionHistoryListSuccess(body)) {
      setHistory({
        status: "error",
        items: [],
        pagination: getFallbackPagination(nextPage),
        errorCode: isSessionHistoryFailure(body) ? body.code : "read_failed",
      });
      loadedKeyRef.current = key;
      return;
    }

    setHistory({
      status: "ready",
      items: body.items.slice(0, SESSION_HISTORY_PAGE_SIZE),
      pagination: body.pagination,
      errorCode: null,
    });
    loadedKeyRef.current = key;
  }, []);

  useEffect(() => {
    const key = getHistoryKey(selectedAvatarId, page);

    if (!selectedAvatarId || !key) {
      loadedKeyRef.current = null;
      return;
    }

    if (loadedKeyRef.current === key) {
      return;
    }

    const controller = new AbortController();
    void loadHistory(selectedAvatarId, page, controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadHistory, page, selectedAvatarId]);

  const refreshHistory = useCallback(async () => {
    if (!selectedAvatarId) {
      return;
    }

    loadedKeyRef.current = null;
    await loadHistory(selectedAvatarId, page);
  }, [loadHistory, page, selectedAvatarId]);

  const removeHistoryItem = useCallback((sessionId: string) => {
    setHistory((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== sessionId),
    }));
  }, []);

  return {
    history,
    refreshHistory,
    removeHistoryItem,
  };
}
