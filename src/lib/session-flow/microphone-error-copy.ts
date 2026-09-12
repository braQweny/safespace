import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import { isRecord } from "@/lib/type-guards";

/**
 * Nazwa wyjątku z `getUserMedia` mówi, co poszło nie tak; ogólne „nie udało
 * się” było fałszywe, bo nic jeszcze nie zostało nagrane. Wspólne dla
 * dyktowania (composer) i rozmowy głosowej (wyspa `VoiceSession`).
 */
export type MicrophoneErrorKind = "denied" | "missing" | "unavailable";

export function getErrorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }

  return isRecord(error) && typeof error.name === "string" ? error.name : "";
}

export function getMicrophoneErrorKind(error: unknown): MicrophoneErrorKind {
  const name = getErrorName(error);

  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "denied";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "missing";
  }

  return "unavailable";
}

export function getMicrophoneErrorCopy(locale: Locale, error: unknown) {
  const { dictation } = getSessionCopy(locale);
  const kind = getMicrophoneErrorKind(error);

  if (kind === "denied") {
    return dictation.microphoneDenied;
  }

  if (kind === "missing") {
    return dictation.microphoneMissing;
  }

  return dictation.microphoneUnavailable;
}
