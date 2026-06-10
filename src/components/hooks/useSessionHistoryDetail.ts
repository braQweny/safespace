import { useState } from "react";
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

  async function openDetail(sessionId: string) {
    setDetailStatus("loading");

    const result = await requestApiJson(`/api/session/history/${encodeURIComponent(sessionId)}`);
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
