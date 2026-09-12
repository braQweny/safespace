import type { Locale } from "@/lib/i18n/locale";
import type { SessionPhase } from "@/lib/session-flow/session-phase";
import {
  VOICE_BUFFER_RETENTION_MS,
  VOICE_CONSTRAINTS_APPEND_INTERVAL_MS,
  VOICE_DEADLINE_RESERVE_MS,
  VOICE_HEARTBEAT_GRACE_MS,
  VOICE_SAFETY_FAILURES_BEFORE_CLOSE,
  VOICE_SIDEBAND_ROTATION_MS,
} from "./constants";

/**
 * Czysty stan obserwatora rozmowy głosowej. Durable Object trzyma go w
 * SQLite i przepuszcza przez te funkcje; żadna z nich nie robi I/O, więc
 * matematyka alarmu, licznik awarii klasyfikatora i fencing epoką są
 * testowane bez runtime Cloudflare.
 */

/** Nasz powód zamknięcia — klient gałęziuje na nim, nigdy na `session.closed.reason` OpenAI. */
export type VoiceCloseReason =
  | "completed"
  | "interrupted"
  | "time_limit_reached"
  | "heartbeat_lost"
  | "safety_unavailable"
  | "reconnected"
  | "deleted"
  | "voice_disabled"
  | "provider_closed";

export const VOICE_CLOSE_REASONS = [
  "completed",
  "interrupted",
  "time_limit_reached",
  "heartbeat_lost",
  "safety_unavailable",
  "reconnected",
  "deleted",
  "voice_disabled",
  "provider_closed",
] as const satisfies readonly VoiceCloseReason[];

export function isVoiceCloseReason(value: unknown): value is VoiceCloseReason {
  return typeof value === "string" && (VOICE_CLOSE_REASONS as readonly string[]).includes(value);
}

export interface VoiceObserverState {
  /** Rośnie przy każdym `arm`; spóźnione wyniki ze starej epoki są ignorowane. */
  epoch: number;
  liveSessionId: string | null;
  locale: Locale;
  avatarName: string;
  startedAtMs: number | null;
  expiresAtMs: number | null;
  armedAtMs: number | null;
  lastBeatAtMs: number | null;
  sidebandOpenedAtMs: number | null;
  lastPhase: SessionPhase | null;
  constraintsAppendedAtMs: number | null;
  safetyFailures: number;
  muted: boolean;
  pendingHangupAtMs: number | null;
  closeReason: VoiceCloseReason | null;
  closedAtMs: number | null;
}

export function createInitialObserverState(): VoiceObserverState {
  return {
    epoch: 0,
    liveSessionId: null,
    locale: "en",
    avatarName: "",
    startedAtMs: null,
    expiresAtMs: null,
    armedAtMs: null,
    lastBeatAtMs: null,
    sidebandOpenedAtMs: null,
    lastPhase: null,
    constraintsAppendedAtMs: null,
    safetyFailures: 0,
    muted: false,
    pendingHangupAtMs: null,
    closeReason: null,
    closedAtMs: null,
  };
}

export interface ArmObserverInput {
  liveSessionId: string;
  startedAtMs: number;
  expiresAtMs: number;
  locale: Locale;
  avatarName: string;
  nowMs: number;
}

/** Nowa sesja live: nowa epoka, czysty licznik awarii, puls od teraz. */
export function armObserverState(previous: VoiceObserverState, input: ArmObserverInput): VoiceObserverState {
  return {
    ...createInitialObserverState(),
    epoch: previous.epoch + 1,
    liveSessionId: input.liveSessionId,
    locale: input.locale,
    avatarName: input.avatarName,
    startedAtMs: input.startedAtMs,
    expiresAtMs: input.expiresAtMs,
    armedAtMs: input.nowMs,
    lastBeatAtMs: input.nowMs,
  };
}

export function acceptsEpoch(state: VoiceObserverState, epoch: number) {
  return state.epoch === epoch && state.closeReason === null;
}

/** Termin rozłączenia sesji live: rezerwa przed `expires_at` na zrzut ostatnich wypowiedzi. */
export function resolveVoiceDeadlineAtMs(expiresAtMs: number | null): number | null {
  return expiresAtMs === null ? null : expiresAtMs - VOICE_DEADLINE_RESERVE_MS;
}

/** Najbliższy moment, w którym alarm ma coś do zrobienia; `null` = nic. */
export function nextAlarmAt(state: VoiceObserverState): number | null {
  if (state.closedAtMs !== null) {
    return state.closedAtMs + VOICE_BUFFER_RETENTION_MS;
  }

  if (state.closeReason !== null) {
    // Zamykanie w toku (łaska po kryzysie): liczy się tylko hangup, w ostateczności termin.
    return state.pendingHangupAtMs ?? resolveVoiceDeadlineAtMs(state.expiresAtMs);
  }

  const candidates = [
    resolveVoiceDeadlineAtMs(state.expiresAtMs),
    state.lastBeatAtMs === null ? null : state.lastBeatAtMs + VOICE_HEARTBEAT_GRACE_MS,
    state.sidebandOpenedAtMs === null ? null : state.sidebandOpenedAtMs + VOICE_SIDEBAND_ROTATION_MS,
    state.pendingHangupAtMs,
  ].filter((value): value is number => value !== null);

  return candidates.length === 0 ? null : Math.min(...candidates);
}

export type AlarmDecision =
  | { action: "hangup"; reason: VoiceCloseReason }
  | { action: "purge" }
  | { action: "reattach" }
  | { action: "rotate" }
  | { action: "idle" };

/** Kolejność ma znaczenie: rozłączona sesja tylko sprząta, termin wygrywa z rotacją. */
export function decideAlarm(state: VoiceObserverState, nowMs: number, sidebandOpen: boolean): AlarmDecision {
  if (state.closedAtMs !== null) {
    return nowMs >= state.closedAtMs + VOICE_BUFFER_RETENTION_MS ? { action: "purge" } : { action: "idle" };
  }

  if (state.pendingHangupAtMs !== null && nowMs >= state.pendingHangupAtMs) {
    return { action: "hangup", reason: state.closeReason ?? "interrupted" };
  }

  const deadlineAtMs = resolveVoiceDeadlineAtMs(state.expiresAtMs);

  if (deadlineAtMs !== null && nowMs >= deadlineAtMs) {
    return { action: "hangup", reason: state.closeReason ?? "time_limit_reached" };
  }

  if (state.closeReason !== null) {
    // Zamykanie w toku: nie rotujemy ani nie podłączamy sideband na nowo.
    return { action: "idle" };
  }

  if (state.lastBeatAtMs !== null && nowMs >= state.lastBeatAtMs + VOICE_HEARTBEAT_GRACE_MS) {
    return { action: "hangup", reason: "heartbeat_lost" };
  }

  if (!sidebandOpen) {
    return { action: "reattach" };
  }

  if (state.sidebandOpenedAtMs !== null && nowMs >= state.sidebandOpenedAtMs + VOICE_SIDEBAND_ROTATION_MS) {
    return { action: "rotate" };
  }

  return { action: "idle" };
}

export function shouldAppendConstraints(state: VoiceObserverState, nowMs: number) {
  return (
    state.constraintsAppendedAtMs === null ||
    nowMs >= state.constraintsAppendedAtMs + VOICE_CONSTRAINTS_APPEND_INTERVAL_MS
  );
}

export function shouldAppendPhase(state: VoiceObserverState, phase: SessionPhase | null) {
  return phase !== null && phase !== state.lastPhase;
}

export type SafetyOutcomeAction = "none" | "paused" | "resumed" | "closed_retryable";

/**
 * Awaria klasyfikatora (fail-closed) wycisza wejście i prosi model o pauzę;
 * trzecia z rzędu zamyka sesję live jako do ponowienia. Pierwsza udana
 * klasyfikacja po pauzie odmutowuje i zeruje licznik.
 */
export function applySafetyOutcome(
  state: VoiceObserverState,
  outcome: "ok" | "fail_closed",
): { state: VoiceObserverState; action: SafetyOutcomeAction } {
  if (outcome === "fail_closed") {
    const safetyFailures = state.safetyFailures + 1;

    if (safetyFailures >= VOICE_SAFETY_FAILURES_BEFORE_CLOSE) {
      return {
        state: { ...state, safetyFailures, muted: true, closeReason: "safety_unavailable" },
        action: "closed_retryable",
      };
    }

    return { state: { ...state, safetyFailures, muted: true }, action: "paused" };
  }

  if (state.muted) {
    return { state: { ...state, safetyFailures: 0, muted: false }, action: "resumed" };
  }

  return { state: { ...state, safetyFailures: 0 }, action: "none" };
}

/** Kryzys: zdanie przekazania, wyciszenie i `hangup` po łasce. */
export function scheduleCrisisHangup(state: VoiceObserverState, nowMs: number, graceMs: number): VoiceObserverState {
  return { ...state, muted: true, pendingHangupAtMs: nowMs + graceMs, closeReason: "interrupted" };
}

export function closeObserverState(
  state: VoiceObserverState,
  reason: VoiceCloseReason,
  nowMs: number,
): VoiceObserverState {
  return {
    ...state,
    closeReason: state.closeReason ?? reason,
    closedAtMs: state.closedAtMs ?? nowMs,
    pendingHangupAtMs: null,
  };
}
