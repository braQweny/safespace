import { transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { isPastDeadline, remainingMs } from "./session-clock";
import { toSessionView, type SessionView } from "./session-state";

const PROVIDER_TIMEOUT_RESERVE_MS = 1_000;
const PROVIDER_TIMEOUT_MIN_MS = 1_000;
const PROVIDER_TIMEOUT_MAX_MS = 12_000;

export interface ExpireSessionRepository {
  transitionSessionLifecycle: typeof transitionSessionLifecycle;
}

export interface ExpireSessionResult {
  session: SessionView;
}

const defaultExpireSessionRepository: ExpireSessionRepository = {
  transitionSessionLifecycle,
};

/** Dokładne milisekundy do terminu (bez zaokrąglenia) — budżet wywołania providera. */
export function getRemainingSessionTimeMs(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  return remainingMs(session.expiresAt, now.getTime());
}

/** Bez sprawdzania statusu — trasy wołają to dla sesji, którą już uznały za aktywną. */
export function isSessionExpired(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  return isPastDeadline(session.expiresAt, now.getTime());
}

/**
 * Provider timeout for one reply, clipped to the session's remaining time.
 * `maxTimeoutMs` is the ceiling the caller can afford for this turn (it grows
 * with a forced reasoning effort — see `resolveSessionReasoningTimeoutMs`);
 * the remaining session budget minus a reserve always wins when it is shorter.
 */
export function getProviderTimeoutWithinSessionMs(
  session: Pick<SessionMetadata, "expiresAt">,
  now: Date = new Date(),
  maxTimeoutMs: number = PROVIDER_TIMEOUT_MAX_MS,
) {
  const ceilingMs =
    Number.isFinite(maxTimeoutMs) && maxTimeoutMs >= PROVIDER_TIMEOUT_MIN_MS
      ? Math.floor(maxTimeoutMs)
      : PROVIDER_TIMEOUT_MAX_MS;
  const sessionRemainingMs = getRemainingSessionTimeMs(session, now);

  if (sessionRemainingMs === null) {
    return ceilingMs;
  }

  const safeBudgetMs = sessionRemainingMs - PROVIDER_TIMEOUT_RESERVE_MS;

  if (safeBudgetMs < PROVIDER_TIMEOUT_MIN_MS) {
    return 0;
  }

  return Math.min(ceilingMs, Math.floor(safeBudgetMs));
}

export async function expireOwnedSession(
  context: SessionDataContext,
  session: SessionMetadata,
  now: Date = new Date(),
  repository: ExpireSessionRepository = defaultExpireSessionRepository,
): Promise<SessionDataResult<ExpireSessionResult>> {
  if (session.status === "expired") {
    return {
      ok: true,
      data: {
        session: toSessionView(session, now),
      },
    };
  }

  const expired = await repository.transitionSessionLifecycle(context, {
    sessionId: session.id,
    nextStatus: "expired",
    endedAt: now.toISOString(),
    durationBucketSeconds: session.durationBucketSeconds,
  });

  if (!expired.ok) {
    return expired;
  }

  return {
    ok: true,
    data: {
      session: toSessionView(expired.data, now),
    },
  };
}
