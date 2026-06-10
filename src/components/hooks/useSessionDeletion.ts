import { useState } from "react";
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

  function requestDelete(sessionId: string) {
    setPendingDeleteId(sessionId);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  async function confirmDelete(sessionId: string) {
    setDeletingId(sessionId);

    try {
      const result = await requestApiJson(`/api/session/history/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
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
