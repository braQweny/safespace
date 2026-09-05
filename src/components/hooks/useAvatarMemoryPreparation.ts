import { useEffect, useRef } from "react";
import { requestApiJson, type ApiJsonResult } from "@/lib/api-client";
import type { SessionAvatarId, SessionModalityId } from "@/lib/session-data/types";
import { isRecord } from "@/lib/type-guards";

interface AvatarChoice {
  avatarId: SessionAvatarId;
  modalityId: SessionModalityId;
}

export function isAvatarMemoryPreparing(result: ApiJsonResult) {
  return (
    result.kind === "json" &&
    result.status === 202 &&
    isRecord(result.body) &&
    result.body.ok === true &&
    result.body.type === "avatar_memory_preparing"
  );
}

// Wyłącznie w przeglądarce: współdzielimy trwające żądanie, nigdy gotowość ani
// treść pamięci. Ponowne wejście musi wykryć nową rozmowę lub usunięcie źródła.
const pendingBatches = new Map<string, Promise<ApiJsonResult>>();

function requestMemoryBatch(avatar: AvatarChoice) {
  const key = `${avatar.modalityId}:${avatar.avatarId}`;
  const pending = pendingBatches.get(key);
  if (pending) return pending;
  const request = requestApiJson("/api/session/prepare-memory", {
    method: "POST",
    body: JSON.stringify(avatar),
    timeoutMs: 80_000,
  }).finally(() => pendingBatches.delete(key));
  pendingBatches.set(key, request);
  return request;
}

export function startAvatarMemoryPreparation(avatar: AvatarChoice) {
  const state = { stopped: false };
  const done = (async () => {
    while (!state.stopped) {
      const result = await requestMemoryBatch(avatar);
      // Błąd lub 429 kończy pracę w tle. Jawny start może później wznowić kursor.
      if (!isAvatarMemoryPreparing(result)) return;
    }
  })();
  return {
    done,
    // Pozwalamy bieżącej partii się zapisać; nie przerywamy jej po kliknięciu
    // startu, bo powtórzenie tej samej generacji tylko wydłużyłoby oczekiwanie.
    stop: () => {
      state.stopped = true;
    },
  };
}

export function useAvatarMemoryPreparation(avatar: AvatarChoice, enabled: boolean) {
  const preparation = useRef<ReturnType<typeof startAvatarMemoryPreparation> | null>(null);
  const { avatarId, modalityId } = avatar;
  useEffect(() => {
    if (!enabled) return;
    const task = startAvatarMemoryPreparation({ avatarId, modalityId });
    preparation.current = task;
    return task.stop;
  }, [avatarId, modalityId, enabled]);

  return async function stopAndWait() {
    const task = preparation.current;
    task?.stop();
    await task?.done;
  };
}
