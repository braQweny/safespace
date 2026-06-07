import { transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
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

function parseTimestampMs(timestamp: string | null) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getRemainingSessionTimeMs(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  const expiresAtMs = parseTimestampMs(session.expiresAt);

  if (expiresAtMs === null) {
    return null;
  }

  return Math.max(0, expiresAtMs - now.getTime());
}

export function isSessionExpired(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  const remainingMs = getRemainingSessionTimeMs(session, now);
  return remainingMs !== null && remainingMs <= 0;
}

export function getProviderTimeoutWithinSessionMs(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  const remainingMs = getRemainingSessionTimeMs(session, now);

  if (remainingMs === null) {
    return PROVIDER_TIMEOUT_MAX_MS;
  }

  const safeBudgetMs = remainingMs - PROVIDER_TIMEOUT_RESERVE_MS;

  if (safeBudgetMs < PROVIDER_TIMEOUT_MIN_MS) {
    return 0;
  }

  return Math.min(PROVIDER_TIMEOUT_MAX_MS, Math.floor(safeBudgetMs));
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
