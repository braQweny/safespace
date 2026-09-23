import type { Locale } from "@/lib/i18n/locale";
import type { SessionQuota, VoiceQuota } from "@/lib/session-data/types";
import { formatSessionBudgetMinutes, resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import { getAccountPagesCopy } from "./account-pages-copy";

/**
 * Karta planu na stronie konta mówi o puli w dwóch wierszach definicji
 * („Rozmowy pisane: 2 z 3 zostały · do 15 min”) zamiast trzech akapitów.
 * Liczby pochodzą z tych samych odczytów co karta startu w panelu
 * (`readSessionQuota`, `readVoiceQuota`) i z `session-budget.ts`, więc konto
 * nie obiecuje ani minuty więcej niż start rozmowy.
 */
export interface AccountPlanRow {
  kind: "written" | "voice";
  label: string;
  value: string;
}

const SEPARATOR = " · ";

function toWholeMinutes(seconds: number) {
  return Math.max(0, Math.floor(seconds / 60));
}

export function formatWrittenPlanRow(locale: Locale, quota: SessionQuota): AccountPlanRow {
  const copy = getAccountPagesCopy(locale).security.plan;
  const duration = copy.upTo(formatSessionBudgetMinutes(locale, resolveSessionDurationSeconds(quota.plan)));

  if (quota.plan === "premium" || quota.sessionLimit === null) {
    return { kind: "written", label: copy.writtenLabel, value: `${copy.writtenUnlimited}${SEPARATOR}${duration}` };
  }

  // Konta sprzed limitu mogą mieć więcej rozmów niż pula — „-16 z 3” nic nie mówi.
  const remaining = Math.max(0, Math.min(quota.sessionLimit, quota.remainingSessions ?? 0));
  const allowance =
    remaining > 0 ? copy.writtenRemaining(remaining, quota.sessionLimit) : copy.writtenUsedUp(quota.sessionLimit);

  return { kind: "written", label: copy.writtenLabel, value: `${allowance}${SEPARATOR}${duration}` };
}

export function formatVoicePlanRow(locale: Locale, quota: VoiceQuota): AccountPlanRow {
  const copy = getAccountPagesCopy(locale).security.plan;

  if (quota.kind === "trial") {
    return {
      kind: "voice",
      label: copy.voiceTrialLabel,
      value: quota.available
        ? `${copy.voiceTrialAvailable}${SEPARATOR}${copy.upTo(formatSessionBudgetMinutes(locale, quota.durationSeconds))}`
        : copy.voiceTrialUsed,
    };
  }

  // Te same zaokrąglenia co `formatVoiceAllowance` / `formatVoiceMinutesRemaining`:
  // pełne minuty, nigdy ponad pulę; rezerwa trwającej rozmowy osobno.
  const limit = toWholeMinutes(quota.limitSeconds);
  const used = Math.min(limit, toWholeMinutes(quota.usedSeconds));
  const remaining = Math.min(limit, toWholeMinutes(quota.remainingSeconds));
  const reserved = Math.min(limit - used, toWholeMinutes(quota.reservedSeconds ?? 0));

  if (remaining <= 0 && reserved <= 0) {
    return { kind: "voice", label: copy.voicePoolLabel, value: copy.voicePoolUsedUp };
  }

  const pool = copy.voicePoolRemaining(remaining, limit);

  return {
    kind: "voice",
    label: copy.voicePoolLabel,
    value: reserved > 0 ? `${pool}${SEPARATOR}${copy.voicePoolReserved(reserved)}` : pool,
  };
}

/** Wiersz pisany zawsze, głosowy tylko przy dostępnej funkcji i udanym odczycie puli. */
export function formatAccountPlanRows(
  locale: Locale,
  quota: SessionQuota,
  voiceQuota: VoiceQuota | null,
): AccountPlanRow[] {
  const rows = [formatWrittenPlanRow(locale, quota)];

  if (voiceQuota) {
    rows.push(formatVoicePlanRow(locale, voiceQuota));
  }

  return rows;
}
