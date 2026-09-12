import { getAiProviderName } from "@/lib/ai-provider/env";
import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { readCurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "@/lib/session-flow/avatar-choice";
import { requireSessionRouteAccess, type SessionRouteAccessFailureCode } from "@/lib/session-flow/route-access";
import { toSessionView } from "@/lib/session-flow/session-state";
import { resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import {
  resolveVoiceStart,
  type VoiceStartFailureCode,
  type VoiceStartResolution,
} from "@/lib/session-flow/voice-start";
import { readSessionQuota } from "@/lib/session-data/quota";
import { createPendingSession, transitionSessionLifecycle } from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionOpeningFailedEvent,
  buildSessionAiProviderFailedEvent,
  buildSessionStartAttemptedEvent,
  type SessionStartReasonCode,
} from "@/lib/operational-visibility/session-events";
import { createSessionOpeningMessage } from "@/lib/session-flow/session-opening";
import type { SessionMessageViewModel } from "@/lib/session-flow/message-contract";
import { prepareOwnedAvatarMemory } from "@/lib/session-flow/avatar-memory";
import {
  readSessionStartRequestBody,
  resolveAboutDifficultyForStart,
  resolveAboutPersonForStart,
} from "@/lib/session-flow/session-start-request";

export const prerender = false;

type StartNextFailureCode =
  | SessionDataErrorCode
  | "account_blocked"
  | "account_access_unavailable"
  | CurrentAvatarChoiceErrorCode
  | "summary_context_unavailable"
  | "session_quota_unavailable"
  | "no_context_not_confirmed"
  | "validation_failed"
  | "session_start_failed"
  | VoiceStartFailureCode;

const SESSION_LIMIT_REDIRECT = "/dashboard?start=limit_reached";
// Rozmowa głosowa: osobne pule i osobne komunikaty na panelu (`?start=voice_*`).
const VOICE_START_REDIRECTS: Readonly<Record<VoiceStartFailureCode, string>> = {
  voice_unavailable: "/dashboard?start=voice_unavailable",
  voice_trial_used: "/dashboard?start=voice_trial_used",
  voice_minutes_exhausted: "/dashboard?start=voice_minutes_exhausted",
  session_quota_unavailable: "/dashboard/session?start=unavailable",
};

function wantsJson(request: Request) {
  return request.headers.get("Accept")?.toLowerCase().includes("application/json") ?? false;
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status });
}

function redirectResponse(context: Parameters<APIRoute>[0], path: string) {
  return context.redirect(path, 303);
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function logStartAttempt(
  outcome: "success" | "failure" | "blocked",
  status: number,
  startedAtMs: number,
  operationalContext: Awaited<ReturnType<typeof buildOperationalRequestContext>>,
  reasonCode: SessionStartReasonCode = "session_start_failed",
) {
  logOperationalEvent(
    {
      ...buildSessionStartAttemptedEvent({
        outcome,
        reasonCode: outcome === "success" ? undefined : reasonCode,
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      status,
    },
    operationalContext,
  );
}

function failureResponse(
  context: Parameters<APIRoute>[0],
  code: StartNextFailureCode,
  status: number,
  redirectTo: string,
) {
  if (!wantsJson(context.request)) {
    return redirectResponse(context, redirectTo);
  }

  return jsonResponse(
    {
      ok: false,
      code,
      redirectTo,
    },
    status,
  );
}

function getAccountAccessRedirect(code: SessionRouteAccessFailureCode) {
  return code === "account_blocked" ? "/account/blocked" : "/account/blocked?state=unavailable";
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    const { code, status, source } = sessionContext.error;
    const fromSessionContext = source === "session_context";
    logStartAttempt(fromSessionContext ? "failure" : "blocked", status, startedAtMs, operationalContext);

    return failureResponse(context, code, status, fromSessionContext ? "/auth/signin" : getAccountAccessRedirect(code));
  }

  const avatarChoice = await readCurrentAvatarChoice(sessionContext.data);

  if (!avatarChoice.ok) {
    const status = avatarChoice.error.code === "missing_avatar" ? 409 : 503;
    logStartAttempt("blocked", status, startedAtMs, operationalContext);

    return failureResponse(context, avatarChoice.error.code, status, "/dashboard/avatar");
  }

  // Opcjonalne `{ aboutPersonId }` z karty osoby; brak body działa jak dotąd.
  const startRequest = await readSessionStartRequestBody(context.request);

  if (!startRequest.ok) {
    logStartAttempt("failure", 400, startedAtMs, operationalContext);

    return failureResponse(context, "validation_failed", 400, "/dashboard");
  }

  // Pre-flight only: the insert trigger on therapy_sessions is the real gate.
  // Follow-ups count against the same allowance as the first session — a free
  // account gets FREE_PLAN_SESSION_LIMIT sessions in total, not per route.
  const quota = await readSessionQuota(sessionContext.data);

  if (!quota.ok) {
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "session_quota_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  // Rozmowa głosowa ma własne pule (jedna próba free, minuty premium), więc
  // limit trzech rozmów tekstowych jej nie dotyczy; bramką próby jest trigger
  // `P0016` przy insercie, tu tylko pre-flight jak dla limitu tekstowego.
  let voiceStart: VoiceStartResolution | null = null;

  if (startRequest.mode === "voice") {
    const resolution = await resolveVoiceStart(sessionContext.data, { plan: quota.data.plan });

    if (!resolution.ok) {
      logStartAttempt(
        resolution.status === 503 ? "failure" : "blocked",
        resolution.status,
        startedAtMs,
        operationalContext,
        resolution.code === "session_quota_unavailable" ? undefined : resolution.code,
      );

      return failureResponse(context, resolution.code, resolution.status, VOICE_START_REDIRECTS[resolution.code]);
    }

    voiceStart = resolution;
  } else if (!quota.data.canStartSession) {
    logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

    return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
  }

  const memory = await prepareOwnedAvatarMemory(sessionContext.data, avatarChoice.data.modality, {
    locale: getRequestLocale(context.locals),
  });

  if (!memory.ok) {
    if (memory.providerFailure) {
      logOperationalEvent(
        buildSessionAiProviderFailedEvent({ reasonCode: memory.providerFailure, provider: getAiProviderName() }),
        operationalContext,
      );
    }
    logStartAttempt("failure", 503, startedAtMs, operationalContext);

    return failureResponse(context, "summary_context_unavailable", 503, "/dashboard/session?start=unavailable");
  }

  if (!memory.ready) {
    return jsonResponse({ ok: true, type: "avatar_memory_preparing" }, 202);
  }

  // Karta musi należeć do właściciela i do tej perspektywy — trafia do briefu
  // przypinanego przy insercie, więc sprawdzamy ją tuż przed nim.
  const aboutPerson = await resolveAboutPersonForStart(
    sessionContext.data,
    startRequest.aboutPersonId,
    avatarChoice.data.modality.avatarId,
  );

  if (!aboutPerson.ok) {
    const status = aboutPerson.code === "validation_failed" ? 400 : 503;
    logStartAttempt("failure", status, startedAtMs, operationalContext);

    return failureResponse(context, aboutPerson.code, status, "/dashboard");
  }

  // Trudność z mapy tematów: ta sama reguła właściciela i perspektywy; zapisana
  // przy sesji tylko jako id (brief z niej to kolejny etap planu).
  const aboutDifficulty = await resolveAboutDifficultyForStart(
    sessionContext.data,
    startRequest.aboutDifficultyId,
    avatarChoice.data.modality.avatarId,
  );

  if (!aboutDifficulty.ok) {
    const status = aboutDifficulty.code === "validation_failed" ? 400 : 503;
    logStartAttempt("failure", status, startedAtMs, operationalContext);

    return failureResponse(context, aboutDifficulty.code, status, "/dashboard");
  }

  // Pinned at start from the plan read above, so a grant or revoke mid-session
  // never stretches or cuts a conversation already under way. A voice session
  // keeps the full bucket in the database and may get a shorter deadline (the
  // rest of the premium pool); the conversation arc follows the deadline.
  const durationBucketSeconds = voiceStart
    ? voiceStart.durationBucketSeconds
    : resolveSessionDurationSeconds(quota.data.plan);
  const durationSeconds = voiceStart ? voiceStart.durationSeconds : durationBucketSeconds;
  const startedAt = new Date();
  const expiresAt = addSeconds(startedAt, durationSeconds);
  const startedAtIso = startedAt.toISOString();
  const expiresAtIso = expiresAt.toISOString();
  const session = await createPendingSession(sessionContext.data, {
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    modalityId: avatarChoice.data.modality.modalityId,
    avatarId: avatarChoice.data.modality.avatarId,
    isTrial: false,
    durationBucketSeconds,
    usesApprovedContext: true,
    usesAvatarMemory: true,
    aboutPersonId: aboutPerson.aboutPersonId,
    aboutDifficultyId: aboutDifficulty.aboutDifficultyId,
    ...(voiceStart ? { mode: "voice" as const } : {}),
  });

  if (!session.ok) {
    // Race-time outcome of the database gate: the last free slot went to a
    // concurrent start of the same owner after the pre-flight above.
    if (session.error.code === "session_limit_reached") {
      logStartAttempt("blocked", 403, startedAtMs, operationalContext, "session_limit_reached");

      return failureResponse(context, "session_limit_reached", 403, SESSION_LIMIT_REDIRECT);
    }

    // The voice trial trigger (`P0016`) is the real gate for a free account.
    if (session.error.code === "voice_trial_already_used") {
      logStartAttempt("blocked", 403, startedAtMs, operationalContext, "voice_trial_used");

      return failureResponse(context, "voice_trial_used", 403, VOICE_START_REDIRECTS.voice_trial_used);
    }

    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  const activeSession = await transitionSessionLifecycle(sessionContext.data, {
    sessionId: session.data.id,
    nextStatus: "active",
    startedAt: startedAtIso,
    expiresAt: expiresAtIso,
    durationBucketSeconds,
  });

  if (!activeSession.ok) {
    logStartAttempt("failure", 500, startedAtMs, operationalContext);

    return failureResponse(context, "session_start_failed", 500, "/dashboard/session?start=failed");
  }

  logStartAttempt("success", 201, startedAtMs, operationalContext);

  // Otwarcie czyta tę samą prywatną kopię pamięci co wszystkie późniejsze
  // odpowiedzi. Rozmowa głosowa otwiera się sama (warstwa live wita użytkownika
  // po połączeniu), więc nie dostaje wiadomości otwierającej.
  const opening = voiceStart
    ? { ok: true as const, message: null }
    : await createSessionOpeningMessage(sessionContext.data, activeSession.data, {
        locale: getRequestLocale(context.locals),
      });

  if (!opening.ok) {
    logOperationalEvent(
      buildSessionOpeningFailedEvent({
        reasonCode: opening.failure,
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      operationalContext,
    );
  }

  const openingMessage: SessionMessageViewModel | undefined =
    opening.ok && opening.message ? opening.message : undefined;

  if (!wantsJson(context.request)) {
    return redirectResponse(context, "/dashboard/session?started=next");
  }

  return jsonResponse(
    {
      ok: true,
      session: toSessionView(activeSession.data, startedAt),
      ...(openingMessage ? { openingMessage } : {}),
    },
    201,
  );
};
