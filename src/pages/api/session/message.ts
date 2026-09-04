import type { APIRoute } from "astro";
import { SessionAiError, type SessionAiErrorCategory } from "@/lib/session-ai/errors";
import { getOpenRouterSessionConfig } from "@/lib/session-ai/env";
import { resolveSessionReasoningTimeoutMs } from "@/lib/session-ai/openrouter-request-params";
import { generateSessionResponse } from "@/lib/session-ai/provider";
import { getSafetyBoundaryUnavailableCopy, getSessionAiFailureCopy } from "@/lib/session-ai/session-response-copy";
import { getValidAvatarChoice } from "@/lib/modalities";
import { evaluateSessionSafety } from "@/lib/session-safety/evaluate-session-safety";
import {
  isFailClosedSessionSafetyReasonCode,
  type FailClosedSessionSafetyReasonCode,
} from "@/lib/session-safety/reason-codes";
import { MAX_SAFETY_RECENT_USER_MESSAGES } from "@/lib/session-safety/classifier-prompt";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import {
  getOwnedSessionMetadata,
  listNewestApprovedSessionSummaryContexts,
  listRecentOwnedSessionMessages,
  transitionSessionLifecycle,
  claimSessionMessageTurn,
  releaseSessionMessageTurn,
} from "@/lib/session-data/repository";
import type {
  ApprovedSessionSummaryContext,
  SessionDataContext,
  SessionMessageRecord,
  SessionMetadata,
} from "@/lib/session-data/types";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionAiProviderFailedEvent,
  buildSessionAiTurnCompletedEvent,
  buildSessionSafetyEvaluatedEventFromDecision,
  buildSessionTimeLimitReachedEvent,
} from "@/lib/operational-visibility/session-events";
import { resolveRecentMessageContextLimit } from "@/lib/session-flow/context-window";
import {
  buildValidationFailureResponse,
  parseSendSessionMessageRequest,
  type SendSessionMessageFailureResponse,
  type SendSessionMessageResponse,
} from "@/lib/session-flow/message-contract";
import { persistSuccessfulMessageTurn, toSessionMessageViewModel } from "@/lib/session-flow/message-persistence";
import { expireOwnedSession, getProviderTimeoutWithinSessionMs, isSessionExpired } from "@/lib/session-flow/time-limit";
import { resolveSessionPhase } from "@/lib/session-flow/session-phase";
import { toSessionView } from "@/lib/session-flow/session-state";

export const prerender = false;

function jsonResponse(body: SendSessionMessageResponse, status: number) {
  return Response.json(body, { status });
}

type MissingOrUnauthorizedCode = Extract<
  SendSessionMessageFailureResponse,
  { type: "missing_or_unauthorized" }
>["code"];

function missingOrUnauthorizedResponse(code: MissingOrUnauthorizedCode) {
  return {
    ok: false,
    type: "missing_or_unauthorized",
    code,
  } satisfies SendSessionMessageFailureResponse;
}

function getSessionAiErrorCategory(error: unknown): SessionAiErrorCategory {
  return error instanceof SessionAiError ? error.category : "provider_unavailable";
}

function toRecentSessionAiMessages(messages: readonly SessionMessageRecord[]) {
  return messages
    .filter(
      (message): message is SessionMessageRecord & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .map((message) => ({
      role: message.role,
      content: message.content,
      sequenceIndex: message.sequenceIndex,
    }));
}

// The classifier sees the user's own last turns so a message that only reads
// as risky in sequence is not judged in isolation. Bounded here and again in
// the prompt builder; assistant turns never reach the classifier.
function toRecentSafetyUserMessages(messages: readonly SessionMessageRecord[]) {
  return messages
    .filter((message) => message.role === "user")
    .slice(-MAX_SAFETY_RECENT_USER_MESSAGES)
    .map((message) => message.content);
}

function unavailableResponse(): SendSessionMessageFailureResponse {
  return {
    ok: false,
    type: "session_not_active",
    code: "session_unavailable",
  };
}

function expiredResponse(session: SessionMetadata, now: Date) {
  return jsonResponse(
    {
      ok: false,
      type: "expired",
      code: "session_expired",
      session: toSessionView(session, now),
    },
    409,
  );
}

function notActiveResponse() {
  return jsonResponse(
    {
      ok: false,
      type: "session_not_active",
      code: "session_not_active",
    },
    409,
  );
}

// A session started without context never reads approved summaries — not even
// ones approved after it began. The decision is pinned on the session row at
// start time instead of being resolved per user on every turn.
async function loadApprovedSummaryContext(context: SessionDataContext, session: SessionMetadata) {
  if (!session.usesApprovedContext) {
    return { ok: true as const, data: [] as ApprovedSessionSummaryContext[] };
  }

  return listNewestApprovedSessionSummaryContexts(context);
}

async function markInterrupted(context: SessionDataContext, session: SessionMetadata) {
  await transitionSessionLifecycle(context, {
    sessionId: session.id,
    nextStatus: "interrupted",
    endedAt: new Date().toISOString(),
    durationBucketSeconds: session.durationBucketSeconds,
  });
}

function toSafetyBoundaryFailureCategory(reasonCode: FailClosedSessionSafetyReasonCode): SessionAiErrorCategory {
  return reasonCode;
}

export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(missingOrUnauthorizedResponse(sessionContext.error.code), sessionContext.error.status);
  }

  const messageRequest = await parseSendSessionMessageRequest(context.request);

  if (!messageRequest) {
    return jsonResponse(buildValidationFailureResponse(), 400);
  }

  const sessionResult = await getOwnedSessionMetadata(sessionContext.data, messageRequest.sessionId);

  if (!sessionResult.ok) {
    const code = sessionResult.error.code === "not_session_owner" ? "not_session_owner" : "session_not_found";

    return jsonResponse(missingOrUnauthorizedResponse(code), 404);
  }

  const session = sessionResult.data;
  const now = new Date();
  const clientMessageId = messageRequest.clientMessageId ?? crypto.randomUUID();
  const claim = await claimSessionMessageTurn(sessionContext.data, {
    sessionId: session.id,
    clientMessageId,
    message: messageRequest.message,
  });

  if (!claim.ok) {
    const code = claim.error.code;
    if (code === "message_in_progress" || code === "message_request_conflict") {
      return jsonResponse({ ok: false, type: code, code }, 409);
    }
    if (code === "invalid_lifecycle_transition" || code === "session_not_found") return notActiveResponse();
    if (code === "session_expired") {
      const expired = await expireOwnedSession(sessionContext.data, session, now);
      return jsonResponse(
        {
          ok: false,
          type: "expired",
          code: "session_expired",
          session: expired.ok ? expired.data.session : toSessionView(session, now),
        },
        409,
      );
    }
    return jsonResponse(unavailableResponse(), 503);
  }

  // A lost HTTP response can be recovered even after the conversation ended.
  // The owner-bound RPC refuses deleted sessions and validates the request text.
  if (claim.data.kind === "completed") {
    const [user, assistant] = claim.data.messages.map(toSessionMessageViewModel);
    if (!user || !assistant) return jsonResponse(unavailableResponse(), 503);
    return jsonResponse(
      {
        ok: true,
        type: claim.data.responseType,
        messages: { user, assistant },
        caution: null,
        session: toSessionView(session, now),
      },
      200,
    );
  }

  const lease = { sessionId: session.id, clientMessageId, attemptId: claim.data.attemptId };
  try {
    if (session.status !== "active") {
      return session.status === "expired" ? expiredResponse(session, now) : notActiveResponse();
    }

    if (isSessionExpired(session, now)) {
      const expired = await expireOwnedSession(sessionContext.data, session, now);

      logOperationalEvent(
        {
          ...buildSessionTimeLimitReachedEvent({
            durationMs: getOperationalDurationMs(startedAtMs),
          }),
          status: 409,
        },
        operationalContext,
      );

      return jsonResponse(
        {
          ok: false,
          type: "expired",
          code: "session_expired",
          session: expired.ok ? expired.data.session : toSessionView(session, now),
        },
        409,
      );
    }

    const modality = getValidAvatarChoice(session.modalityId, session.avatarId);

    if (!modality) {
      return jsonResponse(unavailableResponse(), 503);
    }

    // Ownership was already resolved through `getOwnedSessionMetadata` above, so
    // this reads only the bounded tail the model context needs instead of the
    // whole transcript. The tail grows with the session's own budget.
    const recentMessages = await listRecentOwnedSessionMessages(
      sessionContext.data,
      session.id,
      resolveRecentMessageContextLimit(session.durationBucketSeconds),
    );

    if (!recentMessages.ok) {
      return jsonResponse(unavailableResponse(), 503);
    }

    // The safety decision gates everything below; the summary read is independent
    // of it and only costs a database round trip, so both run at once. Nothing is
    // generated or stored until the decision is in.
    const safetyStartedAtMs = performance.now();
    const [decision, approvedSummaries] = await Promise.all([
      evaluateSessionSafety({
        currentUserMessage: messageRequest.message,
        recentUserMessages: toRecentSafetyUserMessages(recentMessages.data),
        metadata: {
          locale: "pl",
        },
      }),
      loadApprovedSummaryContext(sessionContext.data, session),
    ]);

    logOperationalEvent(
      {
        ...buildSessionSafetyEvaluatedEventFromDecision(decision, {
          provider: "openrouter",
          durationMs: getOperationalDurationMs(safetyStartedAtMs),
        }),
        status: 200,
      },
      operationalContext,
    );

    if (decision.action === "hard_stop") {
      // The boundary could not decide (outage, malformed reply, missing config):
      // fail closed for this turn only. Nothing is generated or stored, but the
      // session stays open — `interrupted` has no way back and counts against
      // the free-plan cap, so a transient blip must not end the conversation.
      if (isFailClosedSessionSafetyReasonCode(decision.reasonCode)) {
        return jsonResponse(
          {
            ok: false,
            type: "ai_retry",
            code: "ai_retry",
            category: toSafetyBoundaryFailureCategory(decision.reasonCode),
            copy: getSafetyBoundaryUnavailableCopy(),
          },
          503,
        );
      }

      await markInterrupted(sessionContext.data, session);

      return jsonResponse(
        {
          ok: false,
          type: "hard_stop",
          code: "safety_stop",
          copy: decision.copy,
          crisisResources: decision.crisisResources,
        },
        423,
      );
    }

    if (!approvedSummaries.ok) {
      return jsonResponse(unavailableResponse(), 503);
    }

    // The ceiling follows the configured reasoning effort (a forced `xhigh`
    // thinks for a long time before the first token); the remaining session
    // budget still wins whenever it is shorter.
    const providerTimeoutMs = getProviderTimeoutWithinSessionMs(
      session,
      new Date(),
      resolveSessionReasoningTimeoutMs(getOpenRouterSessionConfig().reasoningEffort),
    );

    if (providerTimeoutMs <= 0) {
      const expired = await expireOwnedSession(sessionContext.data, session, new Date());

      logOperationalEvent(
        {
          ...buildSessionTimeLimitReachedEvent({
            durationMs: getOperationalDurationMs(startedAtMs),
          }),
          status: 409,
        },
        operationalContext,
      );

      return jsonResponse(
        {
          ok: false,
          type: "expired",
          code: "session_expired",
          session: expired.ok ? expired.data.session : toSessionView(session, new Date()),
        },
        409,
      );
    }

    // Resolved from this session's own budget, so the arc holds for a short trial
    // session and for a longer one alike.
    const sessionPhase = resolveSessionPhase(session, {
      now: new Date(),
      priorMessageCount: recentMessages.data.length,
    });

    let assistantText: string;
    let inputUnits: number | undefined;
    let outputUnits: number | undefined;

    try {
      const response = await generateSessionResponse(
        {
          currentUserMessage: messageRequest.message,
          modality: {
            modalityName: modality.modalityName,
            avatarName: modality.avatarName,
            sessionStyleHint: modality.sessionStyleHint,
          },
          ...(sessionPhase ? { sessionPhase } : {}),
          cautionConstraints: decision.action === "allow_with_constraints" ? decision.constraints : undefined,
          recentMessages: toRecentSessionAiMessages(recentMessages.data),
          approvedSummaries: approvedSummaries.data.map((summary) => ({
            summaryText: summary.summaryText,
            revision: summary.revision,
            createdAt: summary.createdAt,
            updatedAt: summary.updatedAt,
          })),
          locale: "pl",
        },
        undefined,
        {
          timeoutMs: providerTimeoutMs,
        },
      );

      assistantText = response.assistantText;
      inputUnits = response.providerMetadata.usage?.promptTokens;
      outputUnits = response.providerMetadata.usage?.completionTokens;
    } catch (error) {
      const category = getSessionAiErrorCategory(error);

      logOperationalEvent(
        {
          ...buildSessionAiProviderFailedEvent({
            reasonCode: category,
            durationMs: getOperationalDurationMs(startedAtMs),
          }),
          status: 503,
        },
        operationalContext,
      );

      return jsonResponse(
        {
          ok: false,
          type: "ai_retry",
          code: "ai_retry",
          category,
          copy: getSessionAiFailureCopy(category),
        },
        503,
      );
    }

    // The reply took real time; the owner may have ended the session meanwhile
    // (from another tab, or with the "end" button while waiting). A turn must not
    // land on a completed or expired session, so the status is re-read first.
    const latestSession = await getOwnedSessionMetadata(sessionContext.data, session.id);

    if (!latestSession.ok) {
      return jsonResponse(unavailableResponse(), 503);
    }

    if (latestSession.data.status !== "active") {
      return latestSession.data.status === "expired"
        ? expiredResponse(latestSession.data, new Date())
        : notActiveResponse();
    }

    const persistedTurn = await persistSuccessfulMessageTurn(sessionContext.data, {
      ...lease,
      userMessage: messageRequest.message,
      assistantMessage: assistantText,
      responseType: decision.action === "allow_with_constraints" ? "caution" : "success",
    });

    if (!persistedTurn.ok) {
      if (
        persistedTurn.error.code === "invalid_lifecycle_transition" ||
        persistedTurn.error.code === "session_not_found"
      ) {
        return notActiveResponse();
      }
      if (persistedTurn.error.code === "session_expired") {
        const expired = await expireOwnedSession(sessionContext.data, latestSession.data, new Date());
        return jsonResponse(
          {
            ok: false,
            type: "expired",
            code: "session_expired",
            session: expired.ok ? expired.data.session : toSessionView(latestSession.data, new Date()),
          },
          409,
        );
      }
      return jsonResponse(
        {
          ok: false,
          type: "message_persistence_failed",
          code: "message_persistence_failed",
        },
        409,
      );
    }

    logOperationalEvent(
      {
        ...buildSessionAiTurnCompletedEvent({
          provider: "openrouter",
          durationMs: getOperationalDurationMs(startedAtMs),
          inputUnits,
          outputUnits,
        }),
        status: 200,
      },
      operationalContext,
    );

    return jsonResponse(
      {
        ok: true,
        type: decision.action === "allow_with_constraints" ? "caution" : "success",
        messages: persistedTurn.data,
        caution: null,
        session: toSessionView(latestSession.data, new Date()),
      },
      200,
    );
  } finally {
    await releaseSessionMessageTurn(sessionContext.data, lease);
  }
};
