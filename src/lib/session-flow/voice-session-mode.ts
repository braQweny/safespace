import { VOICE_MONTHLY_MINUTES, VOICE_SESSION_MODE } from "astro:env/server";
import { DEFAULT_VOICE_MONTHLY_MINUTES } from "@/lib/session-data/voice-quota";

/**
 * Jedyny importer `VOICE_SESSION_MODE` i `VOICE_MONTHLY_MINUTES`. Flaga gasi
 * start rozmów głosowych, trasy `/api/session/voice/*` (poza heartbeatem,
 * który przy wyłączonej fladze rozłącza trwającą rozmowę), przycisk na panelu
 * i sekcję prywatności; zapisane transkrypty i historia działają zawsze.
 */
export type VoiceSessionMode = "off" | "on";

/** Wszystko poza dosłownym `on` to `off` — literówka nie może włączyć funkcji. */
export function parseVoiceSessionMode(value: string | null | undefined): VoiceSessionMode {
  return value?.trim().toLowerCase() === "on" ? "on" : "off";
}

export function isVoiceSessionEnabled() {
  try {
    return parseVoiceSessionMode(VOICE_SESSION_MODE) === "on";
  } catch {
    // Środowisko bez tej zmiennej w schemacie (np. częściowa atrapa w testach)
    // oznacza wyłączoną funkcję, nigdy włączoną.
    return false;
  }
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
