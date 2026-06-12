import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import type { SessionHistoryDetail } from "@/lib/session-data/types";
import {
  isSessionHistoryDetailSuccess,
  isSessionHistoryFailure,
  type SessionHistoryFailureCode,
} from "@/lib/session-flow/session-history-contract";

export type SessionHistoryDetailStatus = "idle" | "loading" | "error" | "ready";

interface UseSessionHistoryDetailOptions {
  initialDetail?: SessionHistoryDetail | null;
  onDetailLoaded: (detail: SessionHistoryDetail) => void;
  onDetailError: (code: SessionHistoryFailureCode) => void;
}

export function useSessionHistoryDetail({
  initialDetail = null,
  onDetailLoaded,
  onDetailError,
}: UseSessionHistoryDetailOptions) {
  const [detail, setDetail] = useState<SessionHistoryDetail | null>(initialDetail);
  const [detailStatus, setDetailStatus] = useState<SessionHistoryDetailStatus>(initialDetail ? "ready" : "idle");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function openDetail(sessionId: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDetailStatus("loading");

    const result = await requestApiJson(`/api/session/history/${encodeURIComponent(sessionId)}`, {
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      return;
    }

    const body = result.kind === "json" ? result.body : null;

    if (!isSessionHistoryDetailSuccess(body)) {
      setDetail(null);
      setDetailStatus("error");
      onDetailError(isSessionHistoryFailure(body) ? body.code : "read_failed");
      return;
    }

    setDetail(body.detail);
    setDetailStatus("ready");
    onDetailLoaded(body.detail);
  }

  function clearDetail() {
    abortRef.current?.abort();
    setDetail(null);
    setDetailStatus("idle");
  }

  return {
    detail,
    detailStatus,
    openDetail,
    clearDetail,
  };
}
