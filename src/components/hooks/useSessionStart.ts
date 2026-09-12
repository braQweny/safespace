import { useRef, useState } from "react";
import { isAvatarMemoryPreparing, useAvatarMemoryPreparation } from "./useAvatarMemoryPreparation";
import { isRateLimitedApiResult, requestApiJson, type ApiJsonResult } from "@/lib/api-client";
import { getSessionStartCardCopy } from "@/components/session/session-start-card-copy";
import type { Locale } from "@/lib/i18n/locale";
import { isRecord } from "@/lib/type-guards";
import type { SessionMessageViewModel } from "@/lib/session-flow/message-contract";
import type { SessionStartPageState, SessionStartPageStateKind, SessionView } from "@/lib/session-flow/session-state";

/**
 * Rozpoczęcie rozmowy żyje w panelu, a sama rozmowa na osobnej stronie, więc
 * logika startu nie może być zamknięta w hooku prowadzącym rozmowę.
 */
export interface SessionStartNotice {
  title: string;
  body: string;
}

interface StartSessionSuccessResponse {
  ok: true;
  session: SessionView;
  openingMessage?: SessionMessageViewModel;
}

interface StartSessionFailureResponse {
  ok: false;
  code: string;
  redirectTo?: string;
}

export function isStartSessionSuccess(body: unknown): body is StartSessionSuccessResponse {
  return isRecord(body) && body.ok === true && isRecord(body.session) && typeof body.session.id === "string";
}

export function isStartSessionFailure(body: unknown): body is StartSessionFailureResponse {
  return isRecord(body) && body.ok === false && typeof body.code === "string";
}

/**
 * Awaria startu nie zawsze znaczy to samo: wykorzystana próba wraca do ekranu
 * kolejnej rozmowy, wyczerpany limit planu bezpłatnego pokazuje jego stan,
 * a każdy inny błąd oznacza stan nieznany.
 */
export function resolveFailedStartKind(failureCode: string | null): SessionStartPageStateKind {
  if (failureCode === "session_limit_reached") {
    return "session_limit_reached";
  }

  return failureCode === "trial_already_claimed" || failureCode === "no_context_not_confirmed"
    ? "followup_ready"
    : "unavailable";
}

export interface UseSessionStartOptions {
  initialState: SessionStartPageState;
  onStarted: (session: SessionView) => void;
  locale: Locale;
}

export interface SessionStartRequestOptions {
  /** Karta osoby, o której ma być rozmowa — trafia do briefu przypinanego przy starcie. */
  aboutPersonId?: string | null;
  /** Trudność z mapy tematów, o której ma być rozmowa — zapisana przy sesji, tylko id. */
  aboutDifficultyId?: string | null;
  /** Rozmowa głosowa: zawsze przez `start-next` (osobne pule, bez próby tekstowej). */
  mode?: "voice";
}

/** Kody odmowy startu głosowego: karta pokazuje zdanie zamiast przycisku, start tekstowy zostaje. */
export const VOICE_START_FAILURE_CODES = ["voice_unavailable", "voice_trial_used", "voice_minutes_exhausted"] as const;

export type VoiceStartFailureCode = (typeof VOICE_START_FAILURE_CODES)[number];

export function isVoiceStartFailureCode(code: string): code is VoiceStartFailureCode {
  return (VOICE_START_FAILURE_CODES as readonly string[]).includes(code);
}

function buildStartBody(options: SessionStartRequestOptions) {
  const body = {
    ...(options.mode === "voice" ? { mode: "voice" } : {}),
    ...(options.aboutPersonId ? { aboutPersonId: options.aboutPersonId } : {}),
    ...(options.aboutDifficultyId ? { aboutDifficultyId: options.aboutDifficultyId } : {}),
  };
  return Object.keys(body).length > 0 ? { body: JSON.stringify(body) } : {};
}

/** 202 oznacza trwały postęp, nie rozpoczętą sesję. Każde żądanie ma własny limit czasu. */
export async function requestSessionStart(
  isFollowupStart: boolean,
  onPreparing: (preparing: boolean) => void,
  options: SessionStartRequestOptions = {},
): Promise<ApiJsonResult> {
  for (;;) {
    const result = await requestApiJson(isFollowupStart ? "/api/session/start-next" : "/api/session/start", {
      method: "POST",
      timeoutMs: 80_000,
      // Bez karty ani trudności nie ma body ani Content-Type — dokładnie jak dotąd.
      ...buildStartBody(options),
    });
    const preparing = isAvatarMemoryPreparing(result);
    onPreparing(preparing);
    if (!preparing) return result;
  }
}

export function useSessionStart({ initialState, onStarted, locale }: UseSessionStartOptions) {
  const { notices } = getSessionStartCardCopy(locale);
  const [kind, setKind] = useState<SessionStartPageStateKind>(initialState.kind);
  const [isStarting, setIsStarting] = useState(false);
  const [isPreparingMemory, setIsPreparingMemory] = useState(false);
  const startingRef = useRef(false);
  const [notice, setNotice] = useState<SessionStartNotice | null>(null);
  const [voiceFailureCode, setVoiceFailureCode] = useState<VoiceStartFailureCode | null>(null);
  const stopMemoryPreparation = useAvatarMemoryPreparation(initialState.avatar.modality, kind === "followup_ready");

  async function startSession(options: SessionStartRequestOptions = {}) {
    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setIsStarting(true);
    setNotice(null);

    try {
      // Rozmowa głosowa idzie wyłącznie przez `start-next`: pierwsza rozmowa
      // konta też, bo próba tekstowa zostaje nienaruszona.
      const isFollowupStart = kind === "followup_ready" || options.mode === "voice";
      if (kind === "followup_ready") {
        setIsPreparingMemory(true);
        // Czekamy wyłącznie na partię pamięci; karty osób jadą osobną pętlą,
        // na którą start nigdy nie czeka.
        await stopMemoryPreparation();
      }
      const result = await requestSessionStart(isFollowupStart, setIsPreparingMemory, options);

      if (result.kind === "network_error") {
        setNotice({ title: notices.startFailedTitle, body: notices.connectionUnavailableBody });
        return;
      }

      if (isRateLimitedApiResult(result)) {
        setNotice({ title: notices.rateLimitedTitle, body: notices.rateLimitedBody });
        return;
      }

      const body = result.body;

      if (isStartSessionSuccess(body)) {
        onStarted(body.session);
        return;
      }

      if (isStartSessionFailure(body) && body.code === "summary_context_unavailable") {
        setNotice({ title: notices.memoryFailedTitle, body: notices.memoryFailedBody });
        return;
      }

      // Nieaktualna karta osoby (usunięta, inna perspektywa): start bez niej
      // nadal jest możliwy, więc stan karty startu zostaje bez zmian.
      if (isStartSessionFailure(body) && body.code === "validation_failed") {
        setNotice({ title: notices.startFailedTitle, body: notices.startFailedBody });
        return;
      }

      // Odmowa głosowa nie dotyka startu tekstowego: karta chowa przycisk
      // głosowy i mówi dlaczego; nieznany kod chowałby cały start.
      if (isStartSessionFailure(body) && isVoiceStartFailureCode(body.code)) {
        setVoiceFailureCode(body.code);
        return;
      }

      if (isStartSessionFailure(body) && body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }

      setKind(resolveFailedStartKind(isStartSessionFailure(body) ? body.code : null));
      setNotice({ title: notices.startFailedTitle, body: notices.startFailedBody });
    } finally {
      startingRef.current = false;
      setIsStarting(false);
      setIsPreparingMemory(false);
    }
  }

  return {
    kind,
    isStarting,
    isPreparingMemory,
    notice,
    voiceFailureCode,
    startSession,
  };
}
