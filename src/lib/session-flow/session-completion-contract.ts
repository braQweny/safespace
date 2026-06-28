import type { SessionView } from "./session-state";
import { parseSessionIdParam } from "./session-id";
import { isRecord } from "@/lib/type-guards";

export interface CompleteSessionRequest {
  sessionId: string;
}

export type CompleteSessionFailureCode =
  | "validation_failed"
  | "missing_auth"
  | "session_not_found"
  | "session_not_active"
  | "session_expired"
  | "session_complete_failed"
  | "session_data_unavailable"
  | "account_blocked"
  | "account_access_unavailable";

export interface CompleteSessionSuccessResponse {
  ok: true;
  type: "session_completed";
  session: SessionView;
}

export type CompleteSessionFailureResponse =
  | {
      ok: false;
      type: "validation_failed";
      code: "validation_failed";
    }
  | {
      ok: false;
      type: "expired";
      code: "session_expired";
      session: SessionView;
    }
  | {
      ok: false;
      type: "session_completion_error";
      code: Exclude<CompleteSessionFailureCode, "validation_failed" | "session_expired">;
    };

export type CompleteSessionResponse = CompleteSessionSuccessResponse | CompleteSessionFailureResponse;

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function parseCompleteSessionRequest(request: Request): Promise<CompleteSessionRequest | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(body)) {
    return null;
  }

  const sessionId = parseSessionIdParam(normalizeString(body.sessionId));

  return sessionId ? { sessionId } : null;
}

export function completeSessionSuccess(session: SessionView): CompleteSessionSuccessResponse {
  return {
    ok: true,
    type: "session_completed",
    session,
  };
}

export function completeSessionExpired(session: SessionView): CompleteSessionFailureResponse {
  return {
    ok: false,
    type: "expired",
    code: "session_expired",
    session,
  };
}

export function completeSessionFailure(
  code: Exclude<CompleteSessionFailureCode, "session_expired">,
): CompleteSessionFailureResponse {
  if (code === "validation_failed") {
    return {
      ok: false,
      type: "validation_failed",
      code,
    };
  }

  return {
    ok: false,
    type: "session_completion_error",
    code,
  };
}

export function isCompleteSessionResponse(value: unknown): value is CompleteSessionResponse {
  return isRecord(value) && typeof value.ok === "boolean" && typeof value.type === "string";
}
