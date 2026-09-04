import { getValidAvatarChoice } from "@/lib/modalities";
import { getOwnedSessionHistoryDetail } from "@/lib/session-data/repository";
import type { SessionDataContext, SessionId, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import { SessionSummaryError } from "@/lib/session-summary/errors";
import type { SessionSummaryProvider } from "@/lib/session-summary/provider";
import type { GenerateSessionSummaryInput, SessionSummaryResponse } from "@/lib/session-summary/types";

const SUMMARY_SOURCE_MESSAGE_LIMIT = 40;
const SUMMARY_SOURCE_MESSAGE_CHARS = 1_200;
const SUMMARIZABLE_SESSION_STATUSES = new Set(["completed", "expired", "interrupted"]);

export type SessionSummaryFlowFailureCode =
  "missing_auth" | "session_not_found" | "session_not_summarizable" | "read_failed" | "provider_failed";

export type SessionSummaryFlowResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: {
        code: SessionSummaryFlowFailureCode;
      };
    };

export interface SessionSummarySourceRepository {
  getOwnedSessionHistoryDetail: typeof getOwnedSessionHistoryDetail;
}

export interface BuildSessionSummaryGenerationInputOptions {
  sessionId: unknown;
  locale?: string;
  now?: Date;
}

const defaultSessionSummarySourceRepository: SessionSummarySourceRepository = {
  getOwnedSessionHistoryDetail,
};

function summaryFlowFailure(code: SessionSummaryFlowFailureCode): SessionSummaryFlowResult<never> {
  return {
    ok: false,
    error: {
      code,
    },
  };
}

function normalizeSessionSummarySessionId(value: unknown): SessionId | null {
  const sessionId = typeof value === "string" ? value.trim() : "";

  return sessionId || null;
}

function trimAndLimit(value: string, maxLength: number) {
  const trimmed = value.trim();

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trimEnd() : trimmed;
}

function compareMessagesBySequence(left: SessionMessageRecord, right: SessionMessageRecord) {
  return left.sequenceIndex - right.sequenceIndex;
}

function isActiveSessionPastExpiry(session: Pick<SessionMetadata, "status" | "expiresAt">, now: Date) {
  if (session.status !== "active" || !session.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(session.expiresAt);

  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

function isSessionSummarizable(session: SessionMetadata, now: Date) {
  return SUMMARIZABLE_SESSION_STATUSES.has(session.status) || isActiveSessionPastExpiry(session, now);
}

function toSummarySourceMessages(messages: readonly SessionMessageRecord[]): GenerateSessionSummaryInput["messages"] {
  return [...messages]
    .filter(
      (message): message is SessionMessageRecord & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant",
    )
    .sort(compareMessagesBySequence)
    .slice(-SUMMARY_SOURCE_MESSAGE_LIMIT)
    .map((message) => ({
      role: message.role,
      content: trimAndLimit(message.content, SUMMARY_SOURCE_MESSAGE_CHARS),
      sequenceIndex: message.sequenceIndex,
    }))
    .filter((message) => message.content.length > 0);
}

export async function buildOwnedSessionSummaryGenerationInput(
  context: SessionDataContext | null | undefined,
  options: BuildSessionSummaryGenerationInputOptions,
  repository: SessionSummarySourceRepository = defaultSessionSummarySourceRepository,
): Promise<SessionSummaryFlowResult<GenerateSessionSummaryInput>> {
  if (!context) {
    return summaryFlowFailure("missing_auth");
  }

  const sessionId = normalizeSessionSummarySessionId(options.sessionId);

  if (!sessionId) {
    return summaryFlowFailure("session_not_found");
  }

  const detail = await repository.getOwnedSessionHistoryDetail(context, sessionId);

  if (!detail.ok) {
    return summaryFlowFailure(detail.error.code === "session_not_found" ? "session_not_found" : "read_failed");
  }

  if (!isSessionSummarizable(detail.data.session, options.now ?? new Date())) {
    return summaryFlowFailure("session_not_summarizable");
  }

  const messages = toSummarySourceMessages(detail.data.messages);

  if (messages.length === 0) {
    return summaryFlowFailure("session_not_summarizable");
  }

  const modality = getValidAvatarChoice(detail.data.session.modalityId, detail.data.session.avatarId);

  return {
    ok: true,
    data: {
      messages,
      ...(modality
        ? {
            modality: {
              modalityName: modality.modalityName,
              avatarName: modality.avatarName,
              summaryLensHint: modality.summaryLensHint,
            },
          }
        : {}),
      locale: options.locale ?? "pl",
    },
  };
}

export async function generateOwnedSessionSummary(
  context: SessionDataContext | null | undefined,
  options: BuildSessionSummaryGenerationInputOptions,
  provider: SessionSummaryProvider,
  repository: SessionSummarySourceRepository = defaultSessionSummarySourceRepository,
): Promise<SessionSummaryFlowResult<SessionSummaryResponse>> {
  const input = await buildOwnedSessionSummaryGenerationInput(context, options, repository);

  if (!input.ok) {
    return input;
  }

  try {
    return {
      ok: true,
      data: await provider.generateSessionSummary(input.data),
    };
  } catch (error) {
    if (error instanceof SessionSummaryError) {
      return summaryFlowFailure("provider_failed");
    }

    return summaryFlowFailure("provider_failed");
  }
}
