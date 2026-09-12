import type { APIRoute } from "astro";
import { getAiProviderEnv } from "@/lib/ai-provider/env";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { getValidAvatarChoice } from "@/lib/modalities";
import { getModalityPromptNames } from "@/lib/modality-copy";
import { OpenAiLiveError, createLiveSession, hangupLiveSession } from "@/lib/openai/live";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionTimeLimitReachedEvent,
  buildSessionVoiceConnectedEvent,
  type SessionVoiceConnectReasonCode,
} from "@/lib/operational-visibility/session-events";
import {
  buildLiveSessionConfig,
  buildVoiceBackendInstructions,
  buildVoiceLiveInstructions,
} from "@/lib/session-ai/voice-instructions";
import {
  getOwnedSessionMetadata,
  listRecentOwnedSessionMessages,
  markVoiceSessionConnected,
} from "@/lib/session-data/repository";
import type { SessionMessageRecord } from "@/lib/session-data/types";
import { resolveRecentMessageContextLimit } from "@/lib/session-flow/context-window";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { loadOwnedSessionContinuity } from "@/lib/session-flow/session-continuity";
import { resolveSessionPhase } from "@/lib/session-flow/session-phase";
import { toSessionView } from "@/lib/session-flow/session-state";
import { expireOwnedSession, isSessionExpired } from "@/lib/session-flow/time-limit";
import {
  getVoiceRouteFailureStatus,
  parseVoiceConnectRequest,
  voiceRouteExpired,
  voiceRouteFailure,
  voiceRouteValidationFailure,
  type VoiceConnectResponse,
} from "@/lib/session-flow/voice-contract";
import { closeVoiceSession } from "@/lib/session-flow/voice-reconcile";
import { isVoiceStartAvailable } from "@/lib/session-flow/voice-start";
import { getVoiceObserver } from "@/lib/voice/coordinator";

export const prerender = false;

/**
 * Połączenie audio rozmowy głosowej: oferta SDP przeglądarki → sesja live u
 * dostawcy (klucz tylko tutaj, nigdy w przeglądarce) → uzbrojenie obserwatora
 * (Durable Object) → odpowiedź SDP. Kolejność jest nośna: obserwator jest
 * sprawdzany przed utworzeniem płatnej sesji, a każda porażka po jej
 * utworzeniu kończy się `hangup`, żeby nigdy nie została nieśledzona sesja.
 * Identyfikator sesji live żyje wyłącznie w obserwatorze.
 */
function jsonResponse(body: VoiceConnectResponse) {
  const status = body.ok ? 200 : getVoiceRouteFailureStatus(body.code);
  return Response.json(body, { status });
}

function parseTimestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecap(messages: readonly SessionMessageRecord[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content,
      sequenceIndex: message.sequenceIndex,
    }));
}

async function hangupQuietly(apiKey: string, liveSessionId: string) {
  try {
    await hangupLiveSession({ apiKey, liveSessionId });
  } catch {
    // Alarm obserwatora nie zna tej sesji (nie została uzbrojona); dostawca
    // sam zamknie ją po utracie peera. Nic więcej nie da się tu zrobić.
  }
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const locale = getRequestLocale(context.locals);
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  function logConnect(
    outcome: "success" | "failure" | "blocked",
    reasonCode?: SessionVoiceConnectReasonCode,
    status?: number,
  ) {
    logOperationalEvent(
      {
        ...buildSessionVoiceConnectedEvent({
          outcome,
          reasonCode,
          durationMs: getOperationalDurationMs(startedAtMs),
          provider: "openai",
        }),
        ...(status ? { status } : {}),
      },
      operationalContext,
    );
  }

  if (!sessionContext.ok) {
    return jsonResponse(voiceRouteFailure(sessionContext.error.code));
  }

  const request = await parseVoiceConnectRequest(context.request);

  if (!request) {
    return jsonResponse(voiceRouteValidationFailure());
  }

  const sessionResult = await getOwnedSessionMetadata(sessionContext.data, request.sessionId);

  if (!sessionResult.ok) {
    const code = sessionResult.error.code === "session_not_found" ? "session_not_found" : "session_data_unavailable";
    return jsonResponse(voiceRouteFailure(code));
  }

  const session = sessionResult.data;
  const now = new Date();

  if (session.mode !== "voice") {
    return jsonResponse(voiceRouteFailure("session_mode_mismatch"));
  }

  if (session.status !== "active") {
    return jsonResponse(voiceRouteFailure("session_not_active"));
  }

  if (isSessionExpired(session, now)) {
    const expired = await expireOwnedSession(sessionContext.data, session, now);
    await closeVoiceSession(sessionContext.data, session, "time_limit_reached");
    logOperationalEvent(
      { ...buildSessionTimeLimitReachedEvent({ durationMs: getOperationalDurationMs(startedAtMs) }), status: 409 },
      operationalContext,
    );

    return jsonResponse(voiceRouteExpired(expired.ok ? expired.data.session : toSessionView(session, now)));
  }

  // Flaga wyłączona albo dostawca inny niż bezpośrednie OpenAI: bez sesji live.
  if (!isVoiceStartAvailable()) {
    logConnect("blocked", "voice_unavailable", 403);
    return jsonResponse(voiceRouteFailure("voice_unavailable"));
  }

  const modality = getValidAvatarChoice(session.modalityId, session.avatarId);
  const expiresAtMs = parseTimestampMs(session.expiresAt);

  if (!modality || expiresAtMs === null) {
    logConnect("failure", undefined, 503);
    return jsonResponse(voiceRouteFailure("voice_connect_failed"));
  }

  // Obserwator przed sesją live: bez bindingu nie tworzymy płatnej sesji,
  // której nikt nie rozłączy na termin ani nie sklasyfikuje.
  const observer = getVoiceObserver(session.id);

  if (!observer) {
    logConnect("failure", "voice_observer_unavailable", 503);
    return jsonResponse(voiceRouteFailure("voice_observer_unavailable"));
  }

  const [continuity, recentMessages] = await Promise.all([
    loadOwnedSessionContinuity(sessionContext.data, session),
    listRecentOwnedSessionMessages(
      sessionContext.data,
      session.id,
      resolveRecentMessageContextLimit(session.durationBucketSeconds),
    ),
  ]);

  if (!continuity.ok || !recentMessages.ok) {
    logConnect("failure", undefined, 503);
    return jsonResponse(voiceRouteFailure("voice_connect_failed"));
  }

  // Pusty zapis = pierwsze połączenie tej rozmowy (powitanie); wznowienie
  // dostaje ogrodzony zapis dotychczasowych wypowiedzi zamiast powitania.
  const opening = recentMessages.data.length === 0;
  const sessionPhase = resolveSessionPhase(session, { now, priorMessageCount: recentMessages.data.length });
  const providerEnv = getAiProviderEnv();
  const apiKey = providerEnv.apiKey ?? "";

  let liveSessionId: string;
  let answerSdp: string;

  try {
    const config = buildLiveSessionConfig({
      liveInstructions: buildVoiceLiveInstructions({
        locale,
        voiceLiveHint: modality.voiceLiveHint[locale],
        opening,
      }),
      backendInstructions: buildVoiceBackendInstructions({
        locale,
        opening,
        modality: {
          ...getModalityPromptNames(modality.modalityId),
          sessionStyleHint: modality.sessionStyleHint,
          registerExamples: modality.registerExamples[locale],
        },
        ...(sessionPhase ? { sessionPhase } : {}),
        avatarMemory: continuity.avatarMemory,
        peopleBrief: continuity.peopleBrief,
        topicBrief: continuity.topicBrief,
        approvedSummaries: continuity.data.map((summary) => ({
          summaryText: summary.summaryText,
          revision: summary.revision,
          createdAt: summary.createdAt,
          updatedAt: summary.updatedAt,
        })),
        recap: opening ? undefined : toRecap(recentMessages.data),
        avatarFirstName: modality.avatarFirstName,
      }),
      backendModel: providerEnv.sessionModel,
      voice: modality.liveVoice,
    });
    const created = await createLiveSession({ apiKey, sdp: request.sdp, session: config });
    liveSessionId = created.liveSessionId;
    answerSdp = created.answerSdp;
  } catch (error) {
    const category = error instanceof OpenAiLiveError ? error.category : "provider_unavailable";
    logConnect("failure", category, 503);
    return jsonResponse(voiceRouteFailure("voice_provider_unavailable", category));
  }

  // Pula minut liczy się od pierwszego udanego połączenia; wznowienie tej
  // samej rozmowy nie przesuwa go (`null → wartość` tylko raz).
  const reconnected = typeof session.voiceConnectedAt === "string";
  const marked = reconnected
    ? { ok: true as const }
    : await markVoiceSessionConnected(sessionContext.data, session.id, now.toISOString());

  if (!marked.ok) {
    await hangupQuietly(apiKey, liveSessionId);
    logConnect("failure", undefined, 503);
    return jsonResponse(voiceRouteFailure("voice_connect_failed"));
  }

  let epoch: number;

  try {
    const armed = await observer.arm({
      liveSessionId,
      startedAtMs: parseTimestampMs(session.startedAt) ?? now.getTime(),
      expiresAtMs,
      locale,
      avatarName: modality.avatarFirstName,
    });
    epoch = armed.epoch;
  } catch {
    // Sesja live bez obserwatora byłaby płatna i nieśledzona: rozłącz od razu.
    await hangupQuietly(apiKey, liveSessionId);
    logConnect("failure", "voice_observer_unavailable", 503);
    return jsonResponse(voiceRouteFailure("voice_observer_unavailable"));
  }

  logConnect("success", reconnected ? "reconnected" : undefined, 200);

  return jsonResponse({
    ok: true,
    type: "voice_connected",
    sdp: answerSdp,
    expiresAt: session.expiresAt,
    serverNow: now.toISOString(),
    epoch,
    reconnected,
    session: toSessionView(session, now),
  });
};
