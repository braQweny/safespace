import { useState } from "react";
import { isRateLimitedApiResult, requestApiJson } from "@/lib/api-client";
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

export interface StartSessionOptions {
  /** Start a follow-up session that carries no approved summary context. */
  withoutContext?: boolean;
}

export interface ResolveStartWithoutContextInput {
  isFollowupStart: boolean;
  canStartWithoutContext: boolean;
  approvedSummaryCount: number;
  requestedWithoutContext: boolean;
}

/**
 * Decides whether the start request declares a context-free session. With no
 * approved summaries the confirmation is implicit — there is nothing to carry
 * over and the server requires the flag anyway; with summaries present the flag
 * only goes out when the user explicitly opted out.
 */
export function resolveStartWithoutContext({
  isFollowupStart,
  canStartWithoutContext,
  approvedSummaryCount,
  requestedWithoutContext,
}: ResolveStartWithoutContextInput) {
  if (!isFollowupStart || !canStartWithoutContext) {
    return false;
  }

  return requestedWithoutContext || approvedSummaryCount === 0;
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

export function useSessionStart({ initialState, onStarted }: UseSessionStartOptions) {
  const [kind, setKind] = useState<SessionStartPageStateKind>(initialState.kind);
  const [isStarting, setIsStarting] = useState(false);
  const [notice, setNotice] = useState<SessionStartNotice | null>(null);

  async function startSession(options: StartSessionOptions = {}) {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setNotice(null);

    try {
      const isFollowupStart = kind === "followup_ready";
      const startWithoutContext = resolveStartWithoutContext({
        isFollowupStart,
        canStartWithoutContext: initialState.canStartWithoutContext,
        approvedSummaryCount: initialState.approvedSummaries.length,
        requestedWithoutContext: options.withoutContext === true,
      });
      const result = await requestApiJson(isFollowupStart ? "/api/session/start-next" : "/api/session/start", {
        method: "POST",
        ...(startWithoutContext
          ? {
              body: JSON.stringify({
                startWithoutContext: true,
              }),
            }
          : {}),
      });

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
      setIsStarting(false);
    }
  }

  return {
    kind,
    isStarting,
    notice,
    startSession,
  };
}
