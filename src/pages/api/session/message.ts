import type { APIRoute } from "astro";
import { SessionAiError, type SessionAiErrorCategory } from "@/lib/session-ai/errors";
import { generateSessionResponse } from "@/lib/session-ai/provider";
import { getSessionAiFailureCopy } from "@/lib/session-ai/session-response-copy";
import { getValidAvatarChoice } from "@/lib/modalities";
import { evaluateSessionSafety } from "@/lib/session-safety/evaluate-session-safety";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import {
  getOwnedSessionMetadata,
  listNewestApprovedSessionSummaryContexts,
  listOwnedSessionMessages,
  transitionSessionLifecycle,
} from "@/lib/session-data/repository";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionAiProviderFailedEvent,
  buildSessionSafetyEvaluatedEventFromDecision,
  buildSessionTimeLimitReachedEvent,
} from "@/lib/operational-visibility/session-events";
import {
  buildValidationFailureResponse,
  parseSendSessionMessageRequest,
  type SendSessionMessageFailureResponse,
  type SendSessionMessageResponse,
} from "@/lib/session-flow/message-contract";
import { persistSuccessfulMessageTurn } from "@/lib/session-flow/message-persistence";
import { expireOwnedSession, getProviderTimeoutWithinSessionMs, isSessionExpired } from "@/lib/session-flow/time-limit";
import { toSessionView } from "@/lib/session-flow/session-state";

const RECENT_MESSAGE_CONTEXT_LIMIT = 8;

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
    .slice(-RECENT_MESSAGE_CONTEXT_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content,
      sequenceIndex: message.sequenceIndex,
    }));
}

function unavailableResponse(): SendSessionMessageFailureResponse {
  return {
    ok: false,
    type: "session_not_active",
    code: "session_unavailable",
  };
}

async function markInterrupted(context: SessionDataContext, session: SessionMetadata) {
  await transitionSessionLifecycle(context, {
    sessionId: session.id,
    nextStatus: "interrupted",
    endedAt: new Date().toISOString(),
    durationBucketSeconds: session.durationBucketSeconds,
  });
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

  if (session.status !== "active") {
    if (session.status === "expired") {
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

    return jsonResponse(
      {
        ok: false,
        type: "session_not_active",
        code: "session_not_active",
      },
      409,
    );
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

  const recentMessages = await listOwnedSessionMessages(sessionContext.data, session.id);

  if (!recentMessages.ok) {
    return jsonResponse(unavailableResponse(), 503);
  }

  const safetyStartedAtMs = performance.now();
  const decision = await evaluateSessionSafety({
    currentUserMessage: messageRequest.message,
    metadata: {
      locale: "pl",
    },
  });

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

  const providerTimeoutMs = getProviderTimeoutWithinSessionMs(session, new Date());

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

  const approvedSummaries = await listNewestApprovedSessionSummaryContexts(sessionContext.data);

  if (!approvedSummaries.ok) {
    return jsonResponse(unavailableResponse(), 503);
  }

  let assistantText: string;

  try {
    const response = await generateSessionResponse(
      {
        currentUserMessage: messageRequest.message,
        modality: {
          modalityName: modality.modalityName,
          avatarName: modality.avatarName,
          sessionStyleHint: modality.sessionStyleHint,
        },
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

  const persistedTurn = await persistSuccessfulMessageTurn(sessionContext.data, {
    sessionId: session.id,
    userMessage: messageRequest.message,
    assistantMessage: assistantText,
  });

  if (!persistedTurn.ok) {
    return jsonResponse(
      {
        ok: false,
        type: "message_persistence_failed",
        code: "message_persistence_failed",
      },
      409,
    );
  }

  return jsonResponse(
    {
      ok: true,
      type: decision.action === "allow_with_constraints" ? "caution" : "success",
      messages: persistedTurn.data,
      caution: null,
      session: toSessionView(session, new Date()),
    },
    200,
  );
};
