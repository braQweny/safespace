import type { SessionDataResult } from "./errors";
import { countOwnedVoiceSessions, getOwnedAccountPlan, readOwnedVoiceUsage } from "./repository";
import type { AccountPlan, SessionDataContext, SessionId, VoiceQuota, VoiceUsage } from "./types";
import { VOICE_TRIAL_DURATION_SECONDS } from "@/lib/session-flow/session-budget";
import { VOICE_DEADLINE_RESERVE_MS } from "@/lib/voice/constants";

/**
 * Pula rozmów głosowych. Konto free: jedna próba (bucket 600 s), której
 * bramką jest trigger limitu (`P0016`); tu tylko odczyt pre-flight. Próbę
 * zużywa pierwsze udane połączenie audio, nie start: rozmowa zakończona bez
 * mikrofonu jej nie zabiera, a trwająca trzyma ją do połączenia albo terminu
 * (`countOwnedVoiceSessions` liczy tak jak trigger). Konto
 * premium: miesięczna pula sekund liczona od `voice_connected_at` każdej
 * rozmowy głosowej w bieżącym miesiącu UTC. Sekundy liczy baza
 * (`get_owned_voice_usage`, bez limitu wierszy, znaczniki czasu nadaje
 * serwer), a ten moduł jest jedynym miejscem, które zamienia je w
 * uprawnienie: przy starcie (`expires_at` przycięte do reszty puli) i przy
 * każdym połączeniu audio (`readVoiceConnectAllowance`: odmowa albo termin
 * obserwatora przycięty do reszty) — bez Workera nikt nie utworzy płatnej
 * sesji live.
 */

/** Domyślna pula premium, gdy `VOICE_MONTHLY_MINUTES` nie jest ustawione. */
export const DEFAULT_VOICE_MONTHLY_MINUTES = 120;

/** Start głosowy premium wymaga tylu sekund w puli, żeby rozmowa miała sens. */
export const VOICE_MIN_START_SECONDS = 300;

export interface VoiceQuotaRepository {
  getOwnedAccountPlan: typeof getOwnedAccountPlan;
  countOwnedVoiceSessions: typeof countOwnedVoiceSessions;
  readOwnedVoiceUsage: typeof readOwnedVoiceUsage;
}

// Odczytywane przy wywołaniu, nie przy ładowaniu modułu: trasy importujące ten
// moduł są testowane z częściowymi atrapami repozytorium.
function getDefaultVoiceQuotaRepository(): VoiceQuotaRepository {
  return { getOwnedAccountPlan, countOwnedVoiceSessions, readOwnedVoiceUsage };
}

/** Początek bieżącego miesiąca w UTC — pula nie zna stref czasowych. */
export function getUtcMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Sekundy, których nie ma już w puli: przegadane plus zarezerwowane przez
 * trwające rozmowy do ich terminu (rozmowę można wznowić do `expires_at`,
 * więc równoległy start nie może liczyć na te same minuty).
 */
export function toCommittedVoiceSeconds(usage: VoiceUsage): number {
  return Math.max(0, Math.trunc(usage.usedSeconds)) + Math.max(0, Math.trunc(usage.reservedSeconds));
}

export interface VoiceQuotaInput {
  voiceSessionsOwned: number;
  usedSeconds: number;
  /** Rezerwa trwających rozmów (`get_owned_voice_usage`); odejmowana od reszty, nie doliczana do zużycia. */
  reservedSeconds?: number;
  limitMinutes: number;
  monthStart: Date;
}

export function toVoiceQuota(plan: AccountPlan, input: VoiceQuotaInput): VoiceQuota {
  if (plan === "premium") {
    const limitSeconds = Math.max(0, Math.trunc(input.limitMinutes)) * 60;
    const usedSeconds = Math.max(0, Math.trunc(input.usedSeconds));
    const reservedSeconds = Math.max(0, Math.trunc(input.reservedSeconds ?? 0));
    const remainingSeconds = Math.max(0, limitSeconds - usedSeconds - reservedSeconds);

    return {
      kind: "pool",
      plan,
      limitSeconds,
      usedSeconds,
      reservedSeconds,
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
 * czyta tylko licznik rozmów głosowych, które trzymają próbę (połączone albo
 * trwające); premium — zużycie z bieżącego miesiąca razem z rezerwą
 * trwających rozmów.
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
    const usage = await repository.readOwnedVoiceUsage(context, monthStart.toISOString());

    if (!usage.ok) {
      return usage;
    }

    return {
      ok: true,
      data: toVoiceQuota("premium", {
        voiceSessionsOwned: 0,
        usedSeconds: usage.data.usedSeconds,
        reservedSeconds: usage.data.reservedSeconds,
        limitMinutes: options.limitMinutes,
        monthStart,
      }),
    };
  }

  const owned = await repository.countOwnedVoiceSessions(context, now);

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

export type VoiceConnectRefusalCode = "voice_minutes_exhausted" | "voice_trial_used";

export type VoiceConnectAllowance =
  | {
      ok: true;
      /** Termin dla obserwatora: `expires_at` rozmowy albo wcześniej, gdy w puli zostało mniej. */
      deadlineAtMs: number;
      remainingSeconds: number;
    }
  | { ok: false; code: VoiceConnectRefusalCode };

export interface VoiceConnectAllowanceInput {
  /** `pool` = miesięczna pula premium, `trial` = jednorazowe 600 s konta free. */
  kind: "pool" | "trial";
  limitSeconds: number;
  usage: VoiceUsage;
  sessionExpiresAtMs: number;
  nowMs: number;
}

/**
 * Połączenie audio (także wznowienie) dostaje resztę puli po odjęciu
 * przegadanego czasu i rezerwy innych trwających rozmów. Reszta nie dłuższa
 * niż rezerwa terminu obserwatora (15 s) to odmowa: obserwator rozłącza tyle
 * przed terminem, więc płatna sesja live zostałaby rozłączona od razu.
 * Mniejsza reszta niż termin rozmowy przycina termin obserwatora, bo
 * `expires_at` w bazie jest zamrożone (od pierwszego połączenia, które
 * przesuwa zegar rozmowy). Dla pojedynczej rozmowy zaczętej przez
 * `start-next` reszta nigdy nie jest krótsza niż jej termin. `remainingSeconds`
 * zostaje w wyniku: przy pierwszym połączeniu `connect` liczy termin
 * obserwatora ponownie, z przesuniętego `expires_at`.
 */
export function toVoiceConnectAllowance(input: VoiceConnectAllowanceInput): VoiceConnectAllowance {
  const limitSeconds = Math.max(0, Math.trunc(input.limitSeconds));
  const remainingSeconds = Math.max(0, limitSeconds - toCommittedVoiceSeconds(input.usage));

  if (remainingSeconds * 1000 <= VOICE_DEADLINE_RESERVE_MS) {
    return { ok: false, code: input.kind === "pool" ? "voice_minutes_exhausted" : "voice_trial_used" };
  }

  return {
    ok: true,
    deadlineAtMs: Math.min(input.sessionExpiresAtMs, input.nowMs + remainingSeconds * 1000),
    remainingSeconds,
  };
}

export interface ReadVoiceConnectAllowanceOptions {
  sessionId: SessionId;
  sessionDurationBucketSeconds: number | null;
  sessionExpiresAtMs: number;
  /** `VOICE_MONTHLY_MINUTES` odczytane przez wywołującego (ten moduł nie zna env). */
  limitMinutes: number;
  now?: Date;
}

/**
 * Bramka puli przed każdą płatną sesją live (`POST /api/session/voice/connect`).
 *
 * Konto premium i każda rozmowa z bucketem premium (aktywować ją mogło tylko
 * konto premium, więc odebranie planu w trakcie nie wyłącza jej z puli) liczą
 * się do miesięcznej puli. Rozmowa konta free z bucketem próby dostaje łącznie
 * 600 s w całej historii konta: wiersz założony bezpośrednio przez PostgREST,
 * kilka niepołączonych wierszy (próbę zużywa dopiero połączenie, więc trigger
 * ich nie blokuje, gdy poprzedni skończył się bez mikrofonu) albo zapas
 * wierszy z czasów premium nie otwiera kolejnych minut.
 */
export async function readVoiceConnectAllowance(
  context: SessionDataContext,
  options: ReadVoiceConnectAllowanceOptions,
  repository: VoiceQuotaRepository = getDefaultVoiceQuotaRepository(),
): Promise<SessionDataResult<VoiceConnectAllowance>> {
  const now = options.now ?? new Date();
  const plan = await repository.getOwnedAccountPlan(context);

  if (!plan.ok) {
    return plan;
  }

  const pool =
    plan.data.plan === "premium" || (options.sessionDurationBucketSeconds ?? 0) > VOICE_TRIAL_DURATION_SECONDS;
  const since = pool ? getUtcMonthStart(now) : new Date(0);
  const usage = await repository.readOwnedVoiceUsage(context, since.toISOString(), options.sessionId);

  if (!usage.ok) {
    return usage;
  }

  return {
    ok: true,
    data: toVoiceConnectAllowance({
      kind: pool ? "pool" : "trial",
      limitSeconds: pool ? Math.max(0, Math.trunc(options.limitMinutes)) * 60 : VOICE_TRIAL_DURATION_SECONDS,
      usage: usage.data,
      sessionExpiresAtMs: options.sessionExpiresAtMs,
      nowMs: now.getTime(),
    }),
  };
}
