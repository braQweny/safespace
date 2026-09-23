import { listOwnedVoiceObserverSessionIds } from "@/lib/session-data/repository";
import type { SessionDataContext } from "@/lib/session-data/types";
import { VOICE_BUFFER_RETENTION_MS } from "@/lib/voice/constants";
import type { VoiceObserverStub } from "@/lib/voice/coordinator";

/**
 * Obserwatory rozmów głosowych przy usuwaniu konta. Durable Object żyje poza
 * bazą, więc kaskada `delete_own_account` go nie dotyka: bez tego trwająca
 * sesja live działałaby do utraty pulsu (90 s), a bufor — z ogonem zapisanych
 * już wypowiedzi — czekałby na purge 7 dni po zamknięciu.
 *
 * Kolejność w trasie: lista rozmów **przed** RPC (potem wierszy już nie ma),
 * `erase` (hangup + purge) **po** udanym RPC, więc nieudane usunięcie konta
 * niczego nie rozłącza i nie gubi niezrzuconych wypowiedzi. Sprzątanie jest
 * ograniczone i best-effort: awaria albo przekroczony czas nigdy nie blokuje
 * usunięcia konta, bo alarm obserwatora i tak rozłącza po utracie pulsu i
 * czyści bufor 7 dni po zamknięciu.
 */

/** Tyle najnowszych rozmów sprzątamy przy jednym usunięciu konta (limit podżądań Workera). */
export const VOICE_ACCOUNT_ERASE_LIMIT = 100;

/** Po tylu ms trasa przestaje czekać na obserwatory. */
export const VOICE_ACCOUNT_ERASE_TIMEOUT_MS = 5_000;

/**
 * Obserwator trzyma dane najdłużej 7 dni po zamknięciu, a zamyka się
 * najpóźniej na terminie rozmowy (≤ 1 h od założenia wiersza); dzień zapasu
 * pokrywa rozjazd zegarów i spóźniony alarm.
 */
const ERASE_LOOKBACK_MS = VOICE_BUFFER_RETENTION_MS + 24 * 60 * 60_000;

export interface VoiceAccountErasureDependencies {
  listOwnedVoiceObserverSessionIds: typeof listOwnedVoiceObserverSessionIds;
  getVoiceObserver: (sessionId: string) => Promise<VoiceObserverStub | null> | VoiceObserverStub | null;
  timeoutMs: number;
}

async function loadVoiceObserver(sessionId: string) {
  const { getVoiceObserver } = await import("@/lib/voice/coordinator");
  return getVoiceObserver(sessionId);
}

// Odczytywane przy wywołaniu: trasa jest testowana bez runtime Cloudflare.
function getDefaultDependencies(): VoiceAccountErasureDependencies {
  return {
    listOwnedVoiceObserverSessionIds,
    getVoiceObserver: loadVoiceObserver,
    timeoutMs: VOICE_ACCOUNT_ERASE_TIMEOUT_MS,
  };
}

/**
 * Rozmowy, których obserwator może jeszcze coś trzymać; czytane przed RPC
 * usunięcia konta. Nigdy nie rzuca: `null` = listy nie dało się odczytać.
 */
export async function listVoiceObserversToErase(
  context: SessionDataContext,
  now: Date = new Date(),
  dependencies: VoiceAccountErasureDependencies = getDefaultDependencies(),
): Promise<string[] | null> {
  const since = new Date(now.getTime() - ERASE_LOOKBACK_MS);

  try {
    const sessions = await dependencies.listOwnedVoiceObserverSessionIds(
      context,
      since.toISOString(),
      VOICE_ACCOUNT_ERASE_LIMIT,
    );
    return sessions.ok ? sessions.data : null;
  } catch {
    return null;
  }
}

async function eraseOne(sessionId: string, dependencies: VoiceAccountErasureDependencies) {
  const stub = await dependencies.getVoiceObserver(sessionId);

  if (!stub) {
    // Bez bindingu nie ma też sesji live ani bufora (`connect` odmawia bez obserwatora).
    return;
  }

  await stub.erase();
}

/**
 * Rozłącza i czyści obserwatory podanych rozmów, równolegle i w limicie
 * czasu. Nigdy nie rzuca: `true` = wszystkie potwierdziły; `false` = któryś
 * padł albo nie zdążył (trasa loguje to bez identyfikatorów i kończy
 * usuwanie konta).
 */
export async function eraseVoiceObservers(
  sessionIds: readonly string[],
  dependencies: VoiceAccountErasureDependencies = getDefaultDependencies(),
): Promise<boolean> {
  if (sessionIds.length === 0) {
    return true;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      resolve("timeout");
    }, dependencies.timeoutMs);
  });

  try {
    const settled = await Promise.race([
      Promise.allSettled(sessionIds.map((sessionId) => eraseOne(sessionId, dependencies))),
      timedOut,
    ]);

    return settled !== "timeout" && settled.every((result) => result.status === "fulfilled");
  } finally {
    clearTimeout(timer);
  }
}
