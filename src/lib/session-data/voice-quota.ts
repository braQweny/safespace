import type { SessionDataResult } from "./errors";
import { countOwnedVoiceSessions, getOwnedAccountPlan, listOwnedVoiceSessionTimings } from "./repository";
import type { AccountPlan, SessionDataContext, VoiceQuota, VoiceSessionTiming } from "./types";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";

/**
 * Pula rozmów głosowych. Konto free: jedna próba (bucket 600 s), której
 * bramką jest trigger limitu (`P0016`); tu tylko odczyt pre-flight. Konto
 * premium: miesięczna pula sekund liczona w aplikacji od `voice_connected_at`
 * każdej rozmowy głosowej w bieżącym miesiącu UTC — egzekwowana przy starcie
 * (`expires_at` przycięte do reszty puli) i przez termin obserwatora, nie przez
 * bazę: bez Workera nikt nie utworzy płatnej sesji live.
 */

/** Domyślna pula premium, gdy `VOICE_MONTHLY_MINUTES` nie jest ustawione. */
export const DEFAULT_VOICE_MONTHLY_MINUTES = 120;

/** Start głosowy premium wymaga tylu sekund w puli, żeby rozmowa miała sens. */
export const VOICE_MIN_START_SECONDS = 300;

export interface VoiceQuotaRepository {
  getOwnedAccountPlan: typeof getOwnedAccountPlan;
  countOwnedVoiceSessions: typeof countOwnedVoiceSessions;
  listOwnedVoiceSessionTimings: typeof listOwnedVoiceSessionTimings;
}

// Odczytywane przy wywołaniu, nie przy ładowaniu modułu: trasy importujące ten
// moduł są testowane z częściowymi atrapami repozytorium.
function getDefaultVoiceQuotaRepository(): VoiceQuotaRepository {
  return { getOwnedAccountPlan, countOwnedVoiceSessions, listOwnedVoiceSessionTimings };
}

/** Początek bieżącego miesiąca w UTC — pula nie zna stref czasowych. */
export function getUtcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Zużyte sekundy: dla każdej rozmowy od `voice_connected_at` do `ended_at`,
 * a gdy rozmowa jeszcze trwa — do `min(now, expires_at)`; nigdy więcej niż
 * bucket. Rozmowa bez sensownego czasu (uszkodzony wiersz) liczy się jako 0.
 */
export function computeVoiceUsageSeconds(timings: readonly VoiceSessionTiming[], now: Date): number {
  const nowMs = now.getTime();
  let total = 0;

  for (const timing of timings) {
    const startMs = parseMs(timing.voiceConnectedAt);

    if (startMs === null) {
      continue;
    }

    const endedMs = parseMs(timing.endedAt);
    const expiresMs = parseMs(timing.expiresAt);
    const endMs = endedMs ?? (expiresMs === null ? nowMs : Math.min(nowMs, expiresMs));
    const elapsed = Math.max(0, (endMs - startMs) / 1000);
    const cap = timing.durationBucketSeconds ?? Number.POSITIVE_INFINITY;

    total += Math.min(elapsed, cap);
  }

  return Math.round(total);
}

export interface VoiceQuotaInput {
  voiceSessionsOwned: number;
  usedSeconds: number;
  limitMinutes: number;
  monthStart: Date;
}

export function toVoiceQuota(plan: AccountPlan, input: VoiceQuotaInput): VoiceQuota {
  if (plan === "premium") {
    const limitSeconds = Math.max(0, Math.trunc(input.limitMinutes)) * 60;
    const usedSeconds = Math.max(0, Math.trunc(input.usedSeconds));
    const remainingSeconds = Math.max(0, limitSeconds - usedSeconds);

    return {
      kind: "pool",
      plan,
      limitSeconds,
      usedSeconds,
      remainingSeconds,
      canStartVoice: remainingSeconds >= VOICE_MIN_START_SECONDS,
      monthStartIso: input.monthStart.toISOString(),
    };
  }

  return {
    kind: "trial",
    plan,
    available: input.voiceSessionsOwned <= 0,
    durationSeconds: VOICE_TRIAL_DURATION_SECONDS,
  };
}

export interface ReadVoiceQuotaOptions {
  /** `VOICE_MONTHLY_MINUTES` odczytane przez wywołującego (ten moduł nie zna env). */
  limitMinutes: number;
  now?: Date;
}

/**
 * Pre-flight widoku puli głosowej dla panelu, konta i startu. Konto free
 * czyta tylko licznik rozmów głosowych; premium — czasy z bieżącego miesiąca.
 */
export async function readVoiceQuota(
  context: SessionDataContext,
  options: ReadVoiceQuotaOptions,
  repository: VoiceQuotaRepository = getDefaultVoiceQuotaRepository(),
): Promise<SessionDataResult<VoiceQuota>> {
  const now = options.now ?? new Date();
  const plan = await repository.getOwnedAccountPlan(context);

  if (!plan.ok) {
    return plan;
  }

  const monthStart = getUtcMonthStart(now);

  if (plan.data.plan === "premium") {
    const timings = await repository.listOwnedVoiceSessionTimings(context, monthStart.toISOString());

    if (!timings.ok) {
      return timings;
    }

    return {
      ok: true,
      data: toVoiceQuota("premium", {
        voiceSessionsOwned: timings.data.length,
        usedSeconds: computeVoiceUsageSeconds(timings.data, now),
        limitMinutes: options.limitMinutes,
        monthStart,
      }),
    };
  }

  const owned = await repository.countOwnedVoiceSessions(context);

  if (!owned.ok) {
    return owned;
  }

  return {
    ok: true,
    data: toVoiceQuota("free", {
      voiceSessionsOwned: owned.data,
      usedSeconds: 0,
      limitMinutes: options.limitMinutes,
      monthStart,
    }),
  };
}
