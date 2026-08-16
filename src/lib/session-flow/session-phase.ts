import type { SessionMetadata } from "@/lib/session-data/types";

/**
 * Where the conversation sits in the session's arc. Resolved from the session's
 * own time budget rather than from fixed minute marks, so the same thresholds
 * hold for a 15-minute trial session and for the longer paid sessions planned
 * later — a phase is always a fraction of *this* session, never an absolute clock
 * reading.
 */
export type SessionPhase = "opening" | "middle" | "closing";

/**
 * Both phases are capped in absolute time on top of the fraction: opening and
 * closing are conversational moves that take a few minutes, so on a long session
 * the cap wins and only the middle stretches.
 */
const OPENING_MAX_ELAPSED_FRACTION = 0.15;
const OPENING_MAX_ELAPSED_MS = 3 * 60_000;
const CLOSING_MAX_REMAINING_FRACTION = 0.2;
const CLOSING_MAX_REMAINING_MS = 5 * 60_000;

export interface ResolveSessionPhaseOptions {
  now?: Date;
  /**
   * Messages already stored for this session. Only compared against zero, so a
   * bounded tail (the recent-context window) is a safe input: the first exchange
   * is the only case that needs an exact count.
   */
  priorMessageCount?: number;
}

type SessionPhaseSource = Pick<SessionMetadata, "startedAt" | "expiresAt" | "durationBucketSeconds" | "createdAt">;

function parseTimestampMs(timestamp: string | null | undefined) {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSessionStartMs(session: SessionPhaseSource, expiresAtMs: number) {
  const startedAtMs = parseTimestampMs(session.startedAt);

  if (startedAtMs !== null) {
    return startedAtMs;
  }

  // A session row can carry the budget without a start timestamp; derive the
  // start from the deadline instead of guessing a phase from wall-clock time.
  const durationSeconds = session.durationBucketSeconds;

  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return expiresAtMs - durationSeconds * 1_000;
  }

  return parseTimestampMs(session.createdAt);
}

/**
 * Returns null when the session carries no usable time budget — callers then
 * omit the phase section entirely rather than sending the model a guess.
 */
export function resolveSessionPhase(
  session: SessionPhaseSource,
  options: ResolveSessionPhaseOptions = {},
): SessionPhase | null {
  const now = options.now ?? new Date();
  const priorMessageCount = options.priorMessageCount;
  const isFirstExchange = typeof priorMessageCount === "number" && priorMessageCount <= 0;

  const expiresAtMs = parseTimestampMs(session.expiresAt);

  if (expiresAtMs === null) {
    return isFirstExchange ? "opening" : null;
  }

  const startedAtMs = resolveSessionStartMs(session, expiresAtMs);

  if (startedAtMs === null) {
    return isFirstExchange ? "opening" : null;
  }

  const totalMs = expiresAtMs - startedAtMs;

  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return isFirstExchange ? "opening" : null;
  }

  const nowMs = now.getTime();
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const elapsedMs = Math.max(0, nowMs - startedAtMs);

  // Closing wins over opening: a session that is nearly over needs to be settled
  // even if this happens to be the user's first message.
  if (remainingMs <= Math.min(totalMs * CLOSING_MAX_REMAINING_FRACTION, CLOSING_MAX_REMAINING_MS)) {
    return "closing";
  }

  if (isFirstExchange || elapsedMs <= Math.min(totalMs * OPENING_MAX_ELAPSED_FRACTION, OPENING_MAX_ELAPSED_MS)) {
    return "opening";
  }

  return "middle";
}
