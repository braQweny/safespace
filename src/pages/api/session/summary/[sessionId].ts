import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import {
  approveOwnedSessionSummaryRevision,
  getLatestOwnedSessionSummaryState,
  saveGeneratedVisibleSessionSummary,
  toSessionSummaryPreview,
} from "@/lib/session-data/repository";
import { openRouterSessionSummaryProvider } from "@/lib/session-summary/provider";
import { generateOwnedSessionSummary, type SessionSummaryFlowFailureCode } from "@/lib/session-flow/session-summary";
import {
  sessionSummaryFailure,
  type SessionSummaryApproveResponse,
  type SessionSummaryFailureCode,
  type SessionSummaryGenerateResponse,
  type SessionSummaryResponse,
  type SessionSummaryStateResponse,
} from "@/lib/session-flow/session-summary-contract";

export const prerender = false;

function getSessionId(context: Parameters<APIRoute>[0]) {
  const sessionId = context.params.sessionId;

  return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId.trim() : null;
}

function mapSessionDataErrorCode(code: SessionDataErrorCode): SessionSummaryFailureCode {
  if (code === "missing_auth" || code === "session_data_unavailable" || code === "session_not_found") {
    return code;
  }

  if (code === "write_failed") {
    return "approval_failed";
  }

  return "read_failed";
}

function mapGenerationErrorCode(code: SessionSummaryFlowFailureCode): SessionSummaryFailureCode {
  if (code === "missing_auth" || code === "session_not_found" || code === "session_not_summarizable") {
    return code;
  }

  if (code === "provider_failed") {
    return "provider_unavailable";
  }

  return "read_failed";
}

function getFailureStatus(code: SessionSummaryFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  if (code === "session_not_found" || code === "summary_unavailable") {
    return 404;
  }

  if (code === "session_not_summarizable" || code === "approval_failed") {
    return 409;
  }

  return 503;
}

function jsonResponse(body: SessionSummaryResponse) {
  const status = body.ok ? 200 : getFailureStatus(body.code);
  return Response.json(body, { status });
}

async function parseApprovalRevision(request: Request) {
  try {
    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || !("revision" in body)) {
      return null;
    }

    const revision = body.revision;

    return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 1 ? revision : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionSummaryFailure(sessionContext.error.code));
  }

  const sessionId = getSessionId(context);

  if (!sessionId) {
    return jsonResponse(sessionSummaryFailure("session_not_found"));
  }

  const state = await getLatestOwnedSessionSummaryState(sessionContext.data, sessionId);

  if (!state.ok) {
    return jsonResponse(sessionSummaryFailure(mapSessionDataErrorCode(state.error.code)));
  }

  return jsonResponse({
    ok: true,
    type: "session_summary_state",
    state: state.data,
  } satisfies SessionSummaryStateResponse);
};

export const POST: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionSummaryFailure(sessionContext.error.code));
  }

  const sessionId = getSessionId(context);

  if (!sessionId) {
    return jsonResponse(sessionSummaryFailure("session_not_found"));
  }

  const generated = await generateOwnedSessionSummary(
    sessionContext.data,
    {
      sessionId,
      locale: "pl",
    },
    openRouterSessionSummaryProvider,
  );

  if (!generated.ok) {
    return jsonResponse(sessionSummaryFailure(mapGenerationErrorCode(generated.error.code)));
  }

  const saved = await saveGeneratedVisibleSessionSummary(sessionContext.data, {
    sessionId,
    summaryText: generated.data.summaryText,
    status: "draft",
    isVisible: true,
  });

  if (!saved.ok) {
    return jsonResponse(sessionSummaryFailure("generation_failed"));
  }

  const summary = toSessionSummaryPreview(saved.data);

  if (!summary) {
    return jsonResponse(sessionSummaryFailure("generation_failed"));
  }

  return jsonResponse({
    ok: true,
    type: "session_summary_generated",
    summary,
  } satisfies SessionSummaryGenerateResponse);
};

export const PATCH: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionSummaryFailure(sessionContext.error.code));
  }

  const sessionId = getSessionId(context);

  if (!sessionId) {
    return jsonResponse(sessionSummaryFailure("session_not_found"));
  }

  const revision = await parseApprovalRevision(context.request);

  if (!revision) {
    return jsonResponse(sessionSummaryFailure("summary_unavailable"));
  }

  const approved = await approveOwnedSessionSummaryRevision(sessionContext.data, {
    sessionId,
    revision,
  });

  if (!approved.ok) {
    return jsonResponse(sessionSummaryFailure(mapSessionDataErrorCode(approved.error.code)));
  }

  const summary = toSessionSummaryPreview(approved.data);

  if (summary?.status !== "ready") {
    return jsonResponse(sessionSummaryFailure("approval_failed"));
  }

  return jsonResponse({
    ok: true,
    type: "session_summary_approved",
    summary,
  } satisfies SessionSummaryApproveResponse);
};
