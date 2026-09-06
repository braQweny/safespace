import { useEffect, useRef } from "react";
import { requestApiJson, type ApiJsonResult } from "@/lib/api-client";
import type { SessionAvatarId, SessionModalityId } from "@/lib/session-data/types";
import { isRecord } from "@/lib/type-guards";
import { getPendingAvatarMemoryBatch } from "./useAvatarMemoryPreparation";

interface AvatarChoice {
  avatarId: SessionAvatarId;
  modalityId: SessionModalityId;
}

export function isPeopleMemoryPreparing(result: ApiJsonResult) {
  return (
    result.kind === "json" &&
    result.status === 202 &&
    isRecord(result.body) &&
    result.body.ok === true &&
    result.body.type === "people_memory_preparing"
  );
}

function didUpdateCards(result: ApiJsonResult) {
  return result.kind === "json" && isRecord(result.body) && result.body.ok === true && result.body.updated === true;
}

// Jak przy pamięci: współdzielimy trwające żądanie między remontami, nigdy wynik.
const pendingBatches = new Map<string, Promise<ApiJsonResult>>();

function requestPeopleBatch(avatar: AvatarChoice) {
  const key = `${avatar.modalityId}:${avatar.avatarId}`;
  const pending = pendingBatches.get(key);
  if (pending) return pending;
  const request = requestApiJson("/api/session/prepare-people", {
    method: "POST",
    body: JSON.stringify(avatar),
    timeoutMs: 80_000,
  }).finally(() => pendingBatches.delete(key));
  pendingBatches.set(key, request);
  return request;
}

/**
 * Osobna pętla od pamięci: start rozmowy czeka wyłącznie na pamięć, a karty
 * dojeżdżają w tle. Każde żądanie z `updated: true` odświeża listę na panelu.
 * Błąd, pauza providera albo 429 kończą pracę; kolejne wejście wznowi.
 */
export function startPeopleMemoryPreparation(avatar: AvatarChoice, onUpdated: () => void) {
  const state = { stopped: false };
  // Odczyt przez funkcję: po `await` TypeScript nie widzi, że `stop()` mógł
  // w międzyczasie zmienić pole, a zatrzymana pętla nie ma wysyłać kolejnego żądania.
  const isStopped = () => state.stopped;
  const done = (async () => {
    while (!isStopped()) {
      await getPendingAvatarMemoryBatch(avatar);
      if (isStopped()) return;
      const result = await requestPeopleBatch(avatar);
      if (didUpdateCards(result)) onUpdated();
      if (!isPeopleMemoryPreparing(result)) return;
    }
  })();
  return {
    done,
    stop: () => {
      state.stopped = true;
    },
  };
}

export function usePeopleMemoryPreparation(avatar: AvatarChoice, enabled: boolean, onUpdated: () => void) {
  const { avatarId, modalityId } = avatar;
  const onUpdatedRef = useRef(onUpdated);

  useEffect(() => {
    onUpdatedRef.current = onUpdated;
  }, [onUpdated]);

  useEffect(() => {
    if (!enabled) return;
    const task = startPeopleMemoryPreparation({ avatarId, modalityId }, () => {
      onUpdatedRef.current();
    });
    return task.stop;
  }, [avatarId, modalityId, enabled]);
}
