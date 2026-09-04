import { useRef, useState } from "react";
import { isRateLimitedApiResult, requestApiJson, type ApiJsonResult } from "@/lib/api-client";
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
}

/** 202 oznacza trwały postęp, nie rozpoczętą sesję. Każde żądanie ma własny limit czasu. */
export async function requestSessionStart(
  isFollowupStart: boolean,
  onPreparing: (preparing: boolean) => void,
): Promise<ApiJsonResult> {
  for (;;) {
    const result = await requestApiJson(isFollowupStart ? "/api/session/start-next" : "/api/session/start", {
      method: "POST",
      timeoutMs: 80_000,
    });
    const preparing =
      result.kind === "json" &&
      result.status === 202 &&
      isRecord(result.body) &&
      result.body.ok === true &&
      result.body.type === "avatar_memory_preparing";
    onPreparing(preparing);
    if (!preparing) return result;
  }
}

export function useSessionStart({ initialState, onStarted }: UseSessionStartOptions) {
  const [kind, setKind] = useState<SessionStartPageStateKind>(initialState.kind);
  const [isStarting, setIsStarting] = useState(false);
  const [isPreparingMemory, setIsPreparingMemory] = useState(false);
  const startingRef = useRef(false);
  const [notice, setNotice] = useState<SessionStartNotice | null>(null);

  async function startSession() {
    if (startingRef.current) {
      return;
    }

    startingRef.current = true;
    setIsStarting(true);
    setNotice(null);

    try {
      const isFollowupStart = kind === "followup_ready";
      const result = await requestSessionStart(isFollowupStart, setIsPreparingMemory);

      if (result.kind === "network_error") {
        setNotice({
          title: "Nie udało się rozpocząć rozmowy",
          body: "Połączenie z serwerem jest chwilowo niedostępne.",
        });
        return;
      }

      if (isRateLimitedApiResult(result)) {
        setNotice({
          title: "Za dużo prób w krótkim czasie",
          body: "Odczekaj około minuty i spróbuj ponownie rozpocząć rozmowę.",
        });
        return;
      }

      const body = result.body;

      if (isStartSessionSuccess(body)) {
        onStarted(body.session);
        return;
      }

      if (isStartSessionFailure(body) && body.code === "summary_context_unavailable") {
        setNotice({
          title: "Nie udało się przygotować pamięci rozmów",
          body: "Spróbuj ponownie. Zapisany postęp zostaje zachowany, a nowa rozmowa nie została jeszcze rozpoczęta.",
        });
        return;
      }

      if (isStartSessionFailure(body) && body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }

      setKind(resolveFailedStartKind(isStartSessionFailure(body) ? body.code : null));
      setNotice({
        title: "Nie udało się rozpocząć rozmowy",
        body: "Spróbuj ponownie za chwilę albo odśwież panel.",
      });
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
    startSession,
  };
}
