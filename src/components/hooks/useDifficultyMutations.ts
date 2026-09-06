import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import type { DifficultyCard } from "@/lib/session-data/types";
import {
  isDifficultyDeleted,
  isDifficultyEntryDeleted,
  isDifficultyMerged,
  isDifficultyUpdateSuccess,
  isTopicFailure,
  type DifficultyPersonDecision,
  type DifficultyUpdateRequest,
  type TopicFailureCode,
} from "@/lib/session-flow/topic-map-contract";

interface UseDifficultyMutationsOptions {
  onUpdated: (card: DifficultyCard) => void;
  onDeleted: (difficultyId: string) => void;
  onEntryDeleted: (difficultyId: string, card: DifficultyCard | null) => void;
  onMerged: (sourceId: string, card: DifficultyCard) => void;
  onError: (code: TopicFailureCode) => void;
}

function difficultyPath(difficultyId: string) {
  return `/api/session/topics/${encodeURIComponent(difficultyId)}`;
}

/**
 * Mutacje karty trudności (wzór `usePersonMutations`). Przerywamy wyłącznie
 * przy odmontowaniu — każde z tych żądań ma skutek po stronie serwera, więc
 * nowsze wywołanie nie może anulować trwającego.
 */
export function useDifficultyMutations({
  onUpdated,
  onDeleted,
  onEntryDeleted,
  onMerged,
  onError,
}: UseDifficultyMutationsOptions) {
  const [savingDifficultyId, setSavingDifficultyId] = useState<string | null>(null);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);
  const [decidingPersonId, setDecidingPersonId] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function nextSignal() {
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }

  function failureCode(body: unknown, fallback: TopicFailureCode) {
    return isTopicFailure(body) ? body.code : fallback;
  }

  /**
   * Zwraca kod błędu albo `null` po zapisie. Zajęta nazwa nie idzie do
   * `onError`: dialog pokazuje przy niej ofertę scalenia, nie ogólny komunikat.
   */
  async function updateDifficulty(difficultyId: string, input: DifficultyUpdateRequest) {
    const signal = nextSignal();
    setSavingDifficultyId(difficultyId);
    try {
      const result = await requestApiJson(difficultyPath(difficultyId), {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      });
      if (signal.aborted) return "update_failed" as const;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyUpdateSuccess(body)) {
        const code = failureCode(body, "update_failed");
        if (code !== "duplicate_difficulty_label") onError(code);
        return code;
      }
      onUpdated(body.card);
      return null;
    } finally {
      setSavingDifficultyId(null);
    }
  }

  async function updateEntry(difficultyId: string, entryId: string, text: string) {
    const signal = nextSignal();
    setSavingEntryId(entryId);
    try {
      const result = await requestApiJson(`${difficultyPath(difficultyId)}/entries/${encodeURIComponent(entryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
        signal,
      });
      if (signal.aborted) return false;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyUpdateSuccess(body)) {
        onError(failureCode(body, "update_failed"));
        return false;
      }
      onUpdated(body.card);
      return true;
    } finally {
      setSavingEntryId(null);
    }
  }

  function requestDeleteEntry(entryId: string) {
    setPendingDeleteEntryId(entryId);
  }

  function cancelDeleteEntry() {
    setPendingDeleteEntryId(null);
  }

  async function confirmDeleteEntry(difficultyId: string, entryId: string) {
    const signal = nextSignal();
    setSavingEntryId(entryId);
    try {
      const result = await requestApiJson(`${difficultyPath(difficultyId)}/entries/${encodeURIComponent(entryId)}`, {
        method: "DELETE",
        signal,
      });
      if (signal.aborted) return;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyEntryDeleted(body)) {
        onError(failureCode(body, "delete_failed"));
        return;
      }
      setPendingDeleteEntryId(null);
      onEntryDeleted(body.difficultyId, body.card);
    } finally {
      setSavingEntryId(null);
    }
  }

  function requestDelete(difficultyId: string) {
    setPendingDeleteId(difficultyId);
  }

  function cancelDelete() {
    setPendingDeleteId(null);
  }

  async function confirmDelete(difficultyId: string) {
    const signal = nextSignal();
    setDeletingId(difficultyId);
    try {
      const result = await requestApiJson(difficultyPath(difficultyId), { method: "DELETE", signal });
      if (signal.aborted) return;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyDeleted(body)) {
        onError(failureCode(body, "delete_failed"));
        return;
      }
      setPendingDeleteId(null);
      onDeleted(body.difficultyId);
    } finally {
      setDeletingId(null);
    }
  }

  async function decidePerson(difficultyId: string, personId: string, state: DifficultyPersonDecision) {
    const signal = nextSignal();
    setDecidingPersonId(personId);
    try {
      const result = await requestApiJson(`${difficultyPath(difficultyId)}/persons/${encodeURIComponent(personId)}`, {
        method: "POST",
        body: JSON.stringify({ state }),
        signal,
      });
      if (signal.aborted) return false;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyUpdateSuccess(body)) {
        onError(failureCode(body, "update_failed"));
        return false;
      }
      onUpdated(body.card);
      return true;
    } finally {
      setDecidingPersonId(null);
    }
  }

  async function merge(sourceId: string, targetId: string) {
    const signal = nextSignal();
    setMergingId(sourceId);
    try {
      const result = await requestApiJson(`${difficultyPath(sourceId)}/merge`, {
        method: "POST",
        body: JSON.stringify({ targetId }),
        signal,
      });
      if (signal.aborted) return false;
      const body = result.kind === "json" ? result.body : null;
      if (!isDifficultyMerged(body)) {
        onError(failureCode(body, "merge_failed"));
        return false;
      }
      onMerged(body.sourceId, body.card);
      return true;
    } finally {
      setMergingId(null);
    }
  }

  return {
    savingDifficultyId,
    savingEntryId,
    pendingDeleteId,
    deletingId,
    pendingDeleteEntryId,
    decidingPersonId,
    mergingId,
    updateDifficulty,
    updateEntry,
    requestDeleteEntry,
    cancelDeleteEntry,
    confirmDeleteEntry,
    requestDelete,
    cancelDelete,
    confirmDelete,
    decidePerson,
    merge,
  };
}

export type DifficultyMutations = ReturnType<typeof useDifficultyMutations>;
