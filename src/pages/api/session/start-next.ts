import { getAiProviderName } from "@/lib/ai-provider/env";
import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { resolveSessionDurationSeconds } from "@/lib/session-flow/session-budget";
import {
  resolveVoiceStart,
  type VoiceStartFailureCode,
  type VoiceStartResolution,
} from "@/lib/session-flow/voice-start";
import { createPendingSession } from "@/lib/session-data/repository";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { buildSessionAiProviderFailedEvent } from "@/lib/operational-visibility/session-events";
import { prepareOwnedAvatarMemory } from "@/lib/session-flow/avatar-memory";
import { readSessionStartRequestBody } from "@/lib/session-flow/session-start-request";
import {
  beginSessionStart,
  completeSessionStart,
  failSessionLimitReached,
  openSessionStartWindow,
  readSessionStartQuota,
  resolveSessionStartTopics,
  START_FAILED_REDIRECT,
  START_UNAVAILABLE_REDIRECT,
} from "@/lib/session-flow/session-start-route";

export const prerender = false;

type StartNextFailureCode = SessionDataErrorCode | "summary_context_unavailable" | VoiceStartFailureCode;

// Rozmowa głosowa: osobne pule i osobne komunikaty na panelu (`?start=voice_*`).
const VOICE_START_REDIRECTS: Readonly<Record<VoiceStartFailureCode, string>> = {
  voice_unavailable: "/dashboard?start=voice_unavailable",
  voice_trial_used: "/dashboard?start=voice_trial_used",
  voice_minutes_exhausted: "/dashboard?start=voice_minutes_exhausted",
  session_quota_unavailable: START_UNAVAILABLE_REDIRECT,
};

export const POST: APIRoute = async (context) => {
  const start = await beginSessionStart<StartNextFailureCode>(context);

  if (!start.ok) {
    return start.response;
  }

  const scope = start.data;
  const { respond, sessionData, avatarChoice } = scope;

  // Opcjonalne `{ aboutPersonId }` z karty osoby; brak body działa jak dotąd.
  const startRequest = await readSessionStartRequestBody(context.request);

  if (!startRequest.ok) {
    return respond.fail("failure", "validation_failed", 400, "/dashboard");
  }

  const quota = await readSessionStartQuota(scope);

  if (!quota.ok) {
    return quota.response;
  }

  // Rozmowa głosowa ma własne pule (jedna próba free, minuty premium), więc
  // limit trzech rozmów tekstowych jej nie dotyczy; bramką próby jest trigger
  // `P0016` przy insercie, tu tylko pre-flight jak dla limitu tekstowego.
  let voiceStart: VoiceStartResolution | null = null;

  if (startRequest.mode === "voice") {
    const resolution = await resolveVoiceStart(sessionData, { plan: quota.data.plan });

    if (!resolution.ok) {
      return respond.fail(
        resolution.status === 503 ? "failure" : "blocked",
        resolution.code,
        resolution.status,
        VOICE_START_REDIRECTS[resolution.code],
        resolution.code === "session_quota_unavailable" ? undefined : resolution.code,
      );
    }

    voiceStart = resolution;
  } else if (!quota.data.canStartSession) {
    return failSessionLimitReached(respond);
  }

  const memory = await prepareOwnedAvatarMemory(sessionData, avatarChoice.modality, {
    locale: getRequestLocale(context.locals),
  });

  if (!memory.ok) {
    if (memory.providerFailure) {
      respond.logEvent(
        buildSessionAiProviderFailedEvent({ reasonCode: memory.providerFailure, provider: getAiProviderName() }),
      );
    }

    return respond.fail("failure", "summary_context_unavailable", 503, START_UNAVAILABLE_REDIRECT);
  }

  if (!memory.ready) {
    return respond.json({ ok: true, type: "avatar_memory_preparing" }, 202);
  }

  // Karta osoby i trudność z mapy trafiają do briefu przypinanego przy
  // insercie (trudność zapisana przy sesji tylko jako id), więc sprawdzamy je
  // tuż przed nim.
  const topics = await resolveSessionStartTopics(scope, startRequest);

  if (!topics.ok) {
    return topics.response;
  }

  // Pinned at start from the plan read above, so a grant or revoke mid-session
  // never stretches or cuts a conversation already under way. A voice session
  // keeps the full bucket in the database and may get a shorter deadline (the
  // rest of the premium pool); the conversation arc follows the deadline.
  const durationBucketSeconds = voiceStart
    ? voiceStart.durationBucketSeconds
    : resolveSessionDurationSeconds(quota.data.plan);
  const durationSeconds = voiceStart ? voiceStart.durationSeconds : durationBucketSeconds;
  const window = openSessionStartWindow(durationSeconds);
  const session = await createPendingSession(sessionData, {
    startedAt: window.startedAtIso,
    expiresAt: window.expiresAtIso,
    modalityId: avatarChoice.modality.modalityId,
    avatarId: avatarChoice.modality.avatarId,
    isTrial: false,
    durationBucketSeconds,
    usesApprovedContext: true,
    usesAvatarMemory: true,
    aboutPersonId: topics.data.aboutPersonId,
    aboutDifficultyId: topics.data.aboutDifficultyId,
    ...(voiceStart ? { mode: "voice" as const } : {}),
  });

  if (!session.ok) {
    // Race-time outcome of the database gate: the last free slot went to a
    // concurrent start of the same owner after the pre-flight above.
    if (session.error.code === "session_limit_reached") {
      return failSessionLimitReached(respond);
    }

    // The voice trial trigger (`P0016`) is the real gate for a free account.
    if (session.error.code === "voice_trial_already_used") {
      return respond.fail(
        "blocked",
        "voice_trial_used",
        403,
        VOICE_START_REDIRECTS.voice_trial_used,
        "voice_trial_used",
      );
    }

    return respond.fail("failure", "session_start_failed", 500, START_FAILED_REDIRECT);
  }

  // Otwarcie czyta tę samą prywatną kopię pamięci co wszystkie późniejsze
  // odpowiedzi. Rozmowa głosowa otwiera się sama (warstwa live wita użytkownika
  // po połączeniu), więc nie dostaje wiadomości otwierającej.
  return completeSessionStart(scope, {
    sessionId: session.data.id,
    window,
    durationBucketSeconds,
    withOpening: !voiceStart,
    successRedirect: "/dashboard/session?started=next",
  });
};
