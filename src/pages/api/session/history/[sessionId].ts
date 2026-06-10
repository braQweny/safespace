import type { APIRoute } from "astro";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { deleteOwnedSession } from "@/lib/session-data/deletion";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import { readSessionHistoryDetail, toSessionHistoryDeleteSuccessResponse } from "@/lib/session-flow/session-history";
import {
  sessionHistoryFailure,
  type SessionHistoryDeleteResponse,
  type SessionHistoryDetailResponse,
  type SessionHistoryFailureCode,
} from "@/lib/session-flow/session-history-contract";

function getSessionId(context: Parameters<APIRoute>[0]) {
  return context.params.sessionId;
}

function mapDeleteErrorCode(code: SessionDataErrorCode): SessionHistoryFailureCode {
  if (code === "missing_auth" || code === "session_data_unavailable" || code === "session_not_found") {
    return code;
  }

  if (code === "invalid_lifecycle_transition") {
    return "session_not_found";
  }

  return "delete_failed";
}

function getFailureStatus(code: SessionHistoryFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  if (code === "invalid_avatar" || code === "invalid_page") {
    return 400;
  }

  if (code === "session_not_found") {
    return 404;
  }

  if (code === "delete_failed") {
    return 500;
  }

  return 503;
}

function jsonResponse(body: SessionHistoryDetailResponse | SessionHistoryDeleteResponse) {
  const status = body.ok ? 200 : getFailureStatus(body.code);
  return Response.json(body, { status });
}

export const GET: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionHistoryFailure(sessionContext.error.code));
  }

  const response = await readSessionHistoryDetail(sessionContext.data, {
    sessionId: getSessionId(context),
  });

  return jsonResponse(response);
};

export const DELETE: APIRoute = async (context) => {
  const sessionContext = await requireSessionRouteAccess(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionHistoryFailure(sessionContext.error.code));
  }

  const sessionId = getSessionId(context);

  if (!sessionId) {
    return jsonResponse(sessionHistoryFailure("session_not_found"));
  }

  const result = await deleteOwnedSession(sessionContext.data, {
    sessionId,
    deletionReasonCode: "user_request",
  });

  if (!result.ok) {
    return jsonResponse(sessionHistoryFailure(mapDeleteErrorCode(result.error.code)));
  }

  return jsonResponse(toSessionHistoryDeleteSuccessResponse(result.data));
};
