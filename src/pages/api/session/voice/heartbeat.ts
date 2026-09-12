import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import { buildSessionTimeLimitReachedEvent } from "@/lib/operational-visibility/session-events";
import { getOwnedSessionMetadata } from "@/lib/session-data/repository";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { getCrisisResourceRegions } from "@/lib/session-safety/crisis-resources";
import { getCrisisSafetyCopy, getSafetyUnavailableCopy } from "@/lib/session-safety/safety-copy";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { computeRemainingSeconds, toSessionView } from "@/lib/session-flow/session-state";
import { isSessionExpired } from "@/lib/session-flow/time-limit";
import {
  getVoiceRouteFailureStatus,
  parseVoiceHeartbeatRequest,
  voiceRouteFailure,
  voiceRouteValidationFailure,
  type VoiceHeartbeatNotice,
  type VoiceHeartbeatResponse,
} from "@/lib/session-flow/voice-contract";
import {
  applyVoiceTerminalStatus,
  drainVoiceObserver,
  resolveVoiceTerminalStatus,
  type VoiceDrainOutcome,
} from "@/lib/session-flow/voice-reconcile";
import { isVoiceStartAvailable } from "@/lib/session-flow/voice-start";
import { getVoiceObserver, type VoiceObserverStub } from "@/lib/voice/coordinator";
import type { VoiceCloseReason } from "@/lib/voice/observer-state";

export const prerender = false;

/**
 * Puls rozmowy głosowej (co 20 s z przeglądarki): odnawia łaskę pulsu w
 * obserwatorze, zrzuca jego bufor do bazy pod RLS właściciela (dwufazowo:
 * `drain` → RPC → `ack`) i oddaje klientowi prawdę o stanie — nasz powód
 * zamknięcia, epokę, resztę czasu i zapisane wypowiedzi. Termin, wyłączenie
 * funkcji i kryzys przenoszą wiersz w bazie w stan końcowy właśnie tutaj.
 * Bez logu per wywołanie; limiter `VOICE_RATE_LIMITER` w middleware.
 */
function jsonResponse(body: VoiceHeartbeatResponse) {
  const status = body.ok ? 200 : getVoiceRouteFailureStatus(body.code);
  return Response.json(body, { status });
}

interface HeartbeatOutcome {
  session: SessionMetadata;
  drained: VoiceDrainOutcome;
  /** Powód narzucony przez trasę (termin, wyłączenie) wygrywa nad snapshotem. */
  closeReason?: VoiceCloseReason;
  live?: boolean;
}

async function drainAfterClose(
  context: SessionDataContext,
  session: SessionMetadata,
  observer: VoiceObserverStub,
  reason: VoiceCloseReason,
) {
  // Idempotentne: obserwator zamknięty wcześniej (alarm, kryzys) nie rozłącza
  // ponownie, a bufor i tak wraca do bazy w oknie zrzutu po `ended_at`.
  await observer.hangupNow(reason);
  return drainVoiceObserver(context, session.id, observer);
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const locale = getRequestLocale(context.locals);
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(voiceRouteFailure(sessionContext.error.code));
  }

  const request = await parseVoiceHeartbeatRequest(context.request);

  if (!request) {
    return jsonResponse(voiceRouteValidationFailure());
  }

  const sessionResult = await getOwnedSessionMetadata(sessionContext.data, request.sessionId);

  if (!sessionResult.ok) {
    const code = sessionResult.error.code === "session_not_found" ? "session_not_found" : "session_data_unavailable";
    return jsonResponse(voiceRouteFailure(code));
  }

  const session = sessionResult.data;

  if (session.mode !== "voice") {
    return jsonResponse(voiceRouteFailure("session_mode_mismatch"));
  }

  const observer = getVoiceObserver(session.id);

  if (!observer) {
    return jsonResponse(voiceRouteFailure("voice_observer_unavailable"));
  }

  const now = new Date();
  let outcome: HeartbeatOutcome;

  try {
    if (session.status !== "active") {
      // Rozmowa już zakończona (jawnie, po kryzysie, po terminie): sam zrzut
      // resztek bufora w 60-sekundowym oknie po `ended_at`.
      outcome = {
        session,
        drained: await drainVoiceObserver(sessionContext.data, session.id, observer),
        live: false,
      };
    } else if (isSessionExpired(session, now)) {
      const drained = await drainAfterClose(sessionContext.data, session, observer, "time_limit_reached");
      const expired = await applyVoiceTerminalStatus(sessionContext.data, session, "expired", now);
      logOperationalEvent(
        { ...buildSessionTimeLimitReachedEvent({ durationMs: getOperationalDurationMs(startedAtMs) }), status: 200 },
        operationalContext,
      );
      outcome = { session: expired, drained, closeReason: "time_limit_reached", live: false };
    } else if (!isVoiceStartAvailable()) {
      // Wyłącznik działa też w trakcie: trwająca rozmowa jest rozłączana, nie
      // tylko blokowane są nowe. Wiersz kończy się jako `completed` — to nie
      // jest ani kryzys, ani wygaśnięcie.
      const drained = await drainAfterClose(sessionContext.data, session, observer, "voice_disabled");
      const completed = await applyVoiceTerminalStatus(sessionContext.data, session, "completed", now);
      outcome = { session: completed, drained, closeReason: "voice_disabled", live: false };
    } else {
      await observer.beat();
      const drained = await drainVoiceObserver(sessionContext.data, session.id, observer);
      const terminal = resolveVoiceTerminalStatus(drained.snapshot.closeReason);
      const updated = terminal ? await applyVoiceTerminalStatus(sessionContext.data, session, terminal, now) : session;
      outcome = { session: updated, drained };
    }
  } catch {
    return jsonResponse(voiceRouteFailure("voice_observer_unavailable"));
  }

  const { snapshot } = outcome.drained;
  // Klient z niższą epoką został zastąpiony (druga karta, wznowienie): dla
  // niego połączenie jest zamknięte, choć obserwator może dalej żyć.
  const superseded = request.epoch < snapshot.epoch;
  const closeReason = outcome.closeReason ?? (superseded ? "reconnected" : snapshot.closeReason);
  const live = outcome.live ?? (superseded ? false : snapshot.live);
  const notice = resolveNotice(locale, closeReason);

  return jsonResponse({
    ok: true,
    type: "voice_heartbeat",
    live,
    closeReason,
    epoch: snapshot.epoch,
    remainingSeconds: computeRemainingSeconds(outcome.session.expiresAt, now),
    serverNow: now.toISOString(),
    session: toSessionView(outcome.session, now),
    messages: outcome.drained.messages,
    ...(notice ? { notice } : {}),
  });
};

function resolveNotice(locale: ReturnType<typeof getRequestLocale>, closeReason: VoiceCloseReason | null) {
  if (closeReason === "interrupted") {
    const notice: VoiceHeartbeatNotice = {
      variant: "hard_stop",
      copy: getCrisisSafetyCopy(locale),
      crisisResources: getCrisisResourceRegions(locale),
    };
    return notice;
  }

  if (closeReason === "safety_unavailable") {
    const notice: VoiceHeartbeatNotice = { variant: "retry", copy: getSafetyUnavailableCopy(locale) };
    return notice;
  }

  return null;
}
