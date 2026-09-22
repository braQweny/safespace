import { VOICE_MONTHLY_MINUTES, VOICE_SESSION_MODE } from "astro:env/server";
import { isOnOffFlagOn } from "./on-off-flag";
import { DEFAULT_VOICE_MONTHLY_MINUTES } from "@/lib/session-data/voice-quota";

/**
 * Jedyny importer `VOICE_SESSION_MODE` i `VOICE_MONTHLY_MINUTES`. Flaga gasi
 * start rozmów głosowych, trasy `/api/session/voice/*` (poza heartbeatem,
 * który przy wyłączonej fladze rozłącza trwającą rozmowę), przycisk na panelu
 * i sekcję prywatności; zapisane transkrypty i historia działają zawsze.
 */
export function isVoiceSessionEnabled() {
  return isOnOffFlagOn(() => VOICE_SESSION_MODE);
}

/** Dodatnia liczba całkowita minut; wszystko inne to domyślne 120. */
export function parseVoiceMonthlyMinutes(value: string | null | undefined): number {
  const trimmed = value?.trim();

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return DEFAULT_VOICE_MONTHLY_MINUTES;
  }

  const minutes = Number(trimmed);
  return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : DEFAULT_VOICE_MONTHLY_MINUTES;
}

export function getVoiceMonthlyMinutes() {
  try {
    return parseVoiceMonthlyMinutes(VOICE_MONTHLY_MINUTES);
  } catch {
    return DEFAULT_VOICE_MONTHLY_MINUTES;
  }
}
