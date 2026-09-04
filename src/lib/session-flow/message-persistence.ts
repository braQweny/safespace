import { ok, type SessionDataResult } from "@/lib/session-data/errors";
import {
  appendSessionMessages,
  completeSessionMessageTurn,
  getNextSessionMessageSequenceIndex,
} from "@/lib/session-data/repository";
import type { SessionDataContext, SessionMessageRecord } from "@/lib/session-data/types";
import type { SessionMessageViewModel } from "./message-contract";

export interface PersistSuccessfulMessageTurnInput {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  clientMessageId: string;
  attemptId: string;
  responseType: "success" | "caution";
}

export interface PersistOpeningMessageInput {
  sessionId: string;
  assistantMessage: string;
}

// The opening message is persisted before the start route responds, so the
// composer cannot race it — the sequence index read is a formality kept for the
// shared conflict-retry path.
export async function persistOpeningMessage(
  context: SessionDataContext,
  input: PersistOpeningMessageInput,
  repository: MessagePersistenceRepository = defaultMessagePersistenceRepository,
): Promise<SessionDataResult<SessionMessageViewModel>> {
  const nextSequenceIndex = await repository.getNextSessionMessageSequenceIndex(context, input.sessionId);

  if (!nextSequenceIndex.ok) {
    return nextSequenceIndex;
  }

  const insertedMessage = await repository.appendSessionMessages(context, [
    {
      sessionId: input.sessionId,
      role: "assistant",
      sequenceIndex: nextSequenceIndex.data,
      content: input.assistantMessage,
    },
  ]);

  if (!insertedMessage.ok) {
    return insertedMessage;
  }

  const assistant = insertedMessage.data.find((message) => message.role === "assistant");
  const assistantView = assistant ? toSessionMessageViewModel(assistant) : null;

  if (!assistantView) {
    return {
      ok: false,
      error: {
        code: "write_failed",
      },
    };
  }

  return ok(assistantView);
}

export interface PersistedMessageTurn {
  user: SessionMessageViewModel;
  assistant: SessionMessageViewModel;
}

export interface MessagePersistenceRepository {
  getNextSessionMessageSequenceIndex: typeof getNextSessionMessageSequenceIndex;
  appendSessionMessages: typeof appendSessionMessages;
}

const defaultMessagePersistenceRepository: MessagePersistenceRepository = {
  getNextSessionMessageSequenceIndex,
  appendSessionMessages,
};

export function toSessionMessageViewModel(message: SessionMessageRecord): SessionMessageViewModel | null {
  if (message.role !== "user" && message.role !== "assistant") {
    return null;
  }

  return {
    id: message.id,
    role: message.role,
    sequenceIndex: message.sequenceIndex,
    content: message.content,
    createdAt: message.createdAt,
  };
}

export async function persistSuccessfulMessageTurn(
  context: SessionDataContext,
  input: PersistSuccessfulMessageTurnInput,
  repository: { completeSessionMessageTurn: typeof completeSessionMessageTurn } = { completeSessionMessageTurn },
): Promise<SessionDataResult<PersistedMessageTurn>> {
  // The database owns the status/deadline check, sequence allocation, pair
  // insert and idempotency receipt in one transaction under a session lock.
  const insertedMessages = await repository.completeSessionMessageTurn(context, input);
  if (!insertedMessages.ok) {
    return insertedMessages;
  }

  const user = insertedMessages.data.find((message) => message.role === "user");
  const assistant = insertedMessages.data.find((message) => message.role === "assistant");
  const userView = user ? toSessionMessageViewModel(user) : null;
  const assistantView = assistant ? toSessionMessageViewModel(assistant) : null;

  if (!userView || !assistantView) {
    return {
      ok: false,
      error: {
        code: "write_failed",
      },
    };
  }

  return {
    ok: true,
    data: {
      user: userView,
      assistant: assistantView,
    },
  };
}
