import type { SessionLifecycleStatus, SessionMetadata } from "@/lib/session-data/types";
import { isPastDeadline, remainingSeconds } from "./session-clock";

/**
 * Czyste mapowania statusu sesji na stan ekranu, bez żadnego importu wartości
 * z serwera. Reduktory rozmowy (`timed-session-state`, `voice-session-state`)
 * działają w przeglądarce, a `session-state.ts` importuje repozytorium i
 * uzgadnianie głosu — dlatego te funkcje żyją tu, a `session-state` je tylko
 * re-eksportuje dla wołających po stronie serwera. Pilnuje tego
 * `src/lib/__tests__/client-server-boundary.test.ts`.
 */
export type EffectiveSessionStatus = Exclude<SessionLifecycleStatus, "created" | "deleted"> | "claimed";

export type SessionStartPageStateKind =
  | "ready"
  | "active"
  | "expired"
  | "completed"
  | "interrupted"
  | "followup_ready"
  | "trial_already_claimed"
  | "session_limit_reached"
  | "unavailable";

/** Sekundy zaokrąglone w górę — to widzi timer klienta (`SessionView.remainingSeconds`). */
export function computeRemainingSeconds(expiresAt: string | null, now: Date = new Date()) {
  return remainingSeconds(expiresAt, now.getTime());
}

/**
 * Bez sprawdzania statusu (robi to `getEffectiveSessionStatus`). Dawny zapis
 * „zaokrąglone w górę sekundy ≤ 0” znaczył dokładnie `expiresAt <= now`.
 */
export function hasSessionExpired(session: Pick<SessionMetadata, "expiresAt">, now: Date = new Date()) {
  return isPastDeadline(session.expiresAt, now.getTime());
}

export function getEffectiveSessionStatus(
  session: Pick<SessionMetadata, "status" | "expiresAt">,
  now: Date = new Date(),
): EffectiveSessionStatus {
  if (session.status === "active" && hasSessionExpired(session, now)) {
    return "expired";
  }

  if (session.status === "created") {
    return "claimed";
  }

  if (session.status === "deleted") {
    // A deleted session never reaches active flows; map it to "claimed" so the
    // page state resolves to trial_already_claimed without leaking "deleted".
    return "claimed";
  }

  return session.status;
}

export function toSessionStartPageStateKind(status: EffectiveSessionStatus): SessionStartPageStateKind {
  if (status === "active" || status === "expired" || status === "completed" || status === "interrupted") {
    return status;
  }

  return "trial_already_claimed";
}
