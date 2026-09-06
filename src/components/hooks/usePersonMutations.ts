import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import type { PersonCard } from "@/lib/session-data/types";
import {
  isPeopleFailure,
  isPersonFactDeleted,
  isPersonForgetSuccess,
  isPersonUpdateSuccess,
  type PeopleFailureCode,
  type PersonUpdateRequest,
} from "@/lib/session-flow/people-contract";

interface UsePersonMutationsOptions {
  onUpdated: (card: PersonCard) => void;
  onForgotten: (personId: string) => void;
  onFactDeleted: (personId: string, card: PersonCard | null) => void;
  onError: (code: PeopleFailureCode) => void;
}

function personPath(personId: string) {
  return `/api/session/people/${encodeURIComponent(personId)}`;
}

/**
 * Mutacje karty osoby. Przerywamy wyłącznie przy odmontowaniu — każde z tych
 * żądań ma skutek po stronie serwera, więc nowsze wywołanie nie może anulować
 * trwającego (jak `useSessionDeletion`).
 */
export function usePersonMutations({ onUpdated, onForgotten, onFactDeleted, onError }: UsePersonMutationsOptions) {
  const [savingPersonId, setSavingPersonId] = useState<string | null>(null);
  const [savingFactId, setSavingFactId] = useState<string | null>(null);
  const [pendingForgetId, setPendingForgetId] = useState<string | null>(null);
  const [forgettingId, setForgettingId] = useState<string | null>(null);
  const [pendingDeleteFactId, setPendingDeleteFactId] = useState<string | null>(null);
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

  function reportFailure(body: unknown, fallback: PeopleFailureCode) {
    onError(isPeopleFailure(body) ? body.code : fallback);
  }

  async function updatePerson(personId: string, input: PersonUpdateRequest) {
    const signal = nextSignal();
    setSavingPersonId(personId);
    try {
      const result = await requestApiJson(personPath(personId), {
        method: "PATCH",
        body: JSON.stringify(input),
        signal,
      });
      if (signal.aborted) return false;
      const body = result.kind === "json" ? result.body : null;
      if (!isPersonUpdateSuccess(body)) {
        reportFailure(body, "update_failed");
        return false;
      }
      onUpdated(body.card);
      return true;
    } finally {
      setSavingPersonId(null);
    }
  }

  async function updateFact(personId: string, factId: string, text: string) {
    const signal = nextSignal();
    setSavingFactId(factId);
    try {
      const result = await requestApiJson(`${personPath(personId)}/facts/${encodeURIComponent(factId)}`, {
        method: "PATCH",
        body: JSON.stringify({ text }),
        signal,
      });
      if (signal.aborted) return false;
      const body = result.kind === "json" ? result.body : null;
      if (!isPersonUpdateSuccess(body)) {
        reportFailure(body, "update_failed");
        return false;
      }
      onUpdated(body.card);
      return true;
    } finally {
      setSavingFactId(null);
    }
  }

  function requestDeleteFact(factId: string) {
    setPendingDeleteFactId(factId);
  }

  function cancelDeleteFact() {
    setPendingDeleteFactId(null);
  }

  async function confirmDeleteFact(personId: string, factId: string) {
    const signal = nextSignal();
    setSavingFactId(factId);
    try {
      const result = await requestApiJson(`${personPath(personId)}/facts/${encodeURIComponent(factId)}`, {
        method: "DELETE",
        signal,
      });
      if (signal.aborted) return;
      const body = result.kind === "json" ? result.body : null;
      if (!isPersonFactDeleted(body)) {
        reportFailure(body, "delete_failed");
        return;
      }
      setPendingDeleteFactId(null);
      onFactDeleted(body.personId, body.card);
    } finally {
      setSavingFactId(null);
    }
  }

  function requestForget(personId: string) {
    setPendingForgetId(personId);
  }

  function cancelForget() {
    setPendingForgetId(null);
  }

  async function confirmForget(personId: string) {
    const signal = nextSignal();
    setForgettingId(personId);
    try {
      const result = await requestApiJson(`${personPath(personId)}/forget`, { method: "POST", signal });
      if (signal.aborted) return;
      const body = result.kind === "json" ? result.body : null;
      if (!isPersonForgetSuccess(body)) {
        reportFailure(body, "forget_failed");
        return;
      }
      setPendingForgetId(null);
      onForgotten(body.personId);
    } finally {
      setForgettingId(null);
    }
  }

  return {
    savingPersonId,
    savingFactId,
    pendingForgetId,
    forgettingId,
    pendingDeleteFactId,
    updatePerson,
    updateFact,
    requestDeleteFact,
    cancelDeleteFact,
    confirmDeleteFact,
    requestForget,
    cancelForget,
    confirmForget,
  };
}

export type PersonMutations = ReturnType<typeof usePersonMutations>;
