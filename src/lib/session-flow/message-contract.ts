import type { SessionAiErrorCategory } from "@/lib/session-ai/errors";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import type { SessionMessageRole } from "@/lib/session-data/types";
import type { SessionView } from "./session-state";

export const SESSION_MESSAGE_MAX_CHARS = 3_000;

export interface SendSessionMessageRequest {
  sessionId: string;
  message: string;
}

export interface SessionMessageViewModel {
  id: string;
  role: Extract<SessionMessageRole, "user" | "assistant">;
  sequenceIndex: number;
  content: string;
  createdAt: string;
}

export interface SendSessionMessageSuccessResponse {
  ok: true;
  type: "success" | "caution";
  messages: {
    user: SessionMessageViewModel;
    assistant: SessionMessageViewModel;
  };
  caution: SessionSafetyCopy | null;
  session: SessionView;
}

export type SendSessionMessageFailureCode =
  | "validation_failed"
  | "session_not_active"
  | "session_expired"
  | "session_unavailable"
  | "safety_stop"
  | "ai_retry"
  | "message_persistence_failed"
  | SessionDataErrorCode;

export type SendSessionMessageFailureResponse =
  | {
      ok: false;
      type: "validation_failed";
      code: "validation_failed";
      maxChars: number;
    }
  | {
      ok: false;
      type: "missing_or_unauthorized";
      code:
        | "missing_auth"
        | "session_not_found"
        | "not_session_owner"
        | "session_data_unavailable"
        | "account_blocked"
        | "account_access_unavailable";
    }
  | {
      ok: false;
      type: "session_not_active";
      code: "session_not_active" | "session_unavailable";
    }
  | {
      ok: false;
      type: "expired";
      code: "session_expired";
      session: SessionView;
    }
  | {
      ok: false;
      type: "hard_stop";
      code: "safety_stop";
      copy: SessionSafetyCopy;
      crisisResources: readonly CrisisResourceRegion[];
    }
  | {
      ok: false;
      type: "ai_retry";
      code: "ai_retry";
      category: SessionAiErrorCategory;
      copy: SessionAiFailureCopy;
    }
  | {
      ok: false;
      type: "message_persistence_failed";
      code: "message_persistence_failed";
    };

export type SendSessionMessageResponse = SendSessionMessageSuccessResponse | SendSessionMessageFailureResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function parseSendSessionMessageRequest(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  if (!isRecord(body)) {
    return null;
  }

  const sessionId = normalizeString(body.sessionId);
  const message = normalizeString(body.message);

  if (!sessionId || !message || message.length > SESSION_MESSAGE_MAX_CHARS) {
    return null;
  }

  return {
    sessionId,
    message,
  } satisfies SendSessionMessageRequest;
}

export function buildValidationFailureResponse(): SendSessionMessageFailureResponse {
  return {
    ok: false,
    type: "validation_failed",
    code: "validation_failed",
    maxChars: SESSION_MESSAGE_MAX_CHARS,
  };
}
