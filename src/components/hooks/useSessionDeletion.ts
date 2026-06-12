import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import {
  isSessionHistoryDeleteSuccess,
  isSessionHistoryFailure,
  type SessionHistoryFailureCode,
} from "@/lib/session-flow/session-history-contract";

interface UseSessionDeletionOptions {
  initialConfirmSessionId?: string | null;
  onDeleted: (sessionId: string) => Promise<void> | void;
  onDeleteError: (code: SessionHistoryFailureCode) => void;
}

export function useSessionDeletion({
  initialConfirmSessionId = null,
  onDeleted,
  onDeleteError,
}: UseSessionDeletionOptions) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(initialConfirmSessionId);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Abort only on unmount — DELETE has a server-side effect, so a newer call
  // must not cancel an in-flight delete that may already have executed.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function requestDelete(sessionId: string) {
    setPendingDeleteId(sessionId);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  async function confirmDelete(sessionId: string) {
    const controller = new AbortController();
    abortRef.current = controller;

    setDeletingId(sessionId);

    try {
      const result = await requestApiJson(`/api/session/history/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return;
      }

      const body = result.kind === "json" ? result.body : null;

      if (!isSessionHistoryDeleteSuccess(body)) {
        onDeleteError(isSessionHistoryFailure(body) ? body.code : "delete_failed");
        return;
      }

      setPendingDeleteId(null);
      await onDeleted(sessionId);
    } finally {
      setDeletingId(null);
    }
  }

  return {
    pendingDeleteId,
    deletingId,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
