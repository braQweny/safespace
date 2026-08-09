import { appendSessionMessages, getNextSessionMessageSequenceIndex } from "@/lib/session-data/repository";
import type { SessionDataResult } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord } from "@/lib/session-data/types";
import type { SessionMessageViewModel } from "./message-contract";

export interface PersistSuccessfulMessageTurnInput {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
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

const SEQUENCE_CONFLICT_MAX_ATTEMPTS = 3;

export async function persistSuccessfulMessageTurn(
  context: SessionDataContext,
  input: PersistSuccessfulMessageTurnInput,
  repository: MessagePersistenceRepository = defaultMessagePersistenceRepository,
): Promise<SessionDataResult<PersistedMessageTurn>> {
  let insertedMessages: Awaited<ReturnType<typeof repository.appendSessionMessages>> | null = null;

  // The unique (session_id, sequence_index) constraint rejects a turn whose
  // indexes were taken by a concurrent request; re-read and retry instead of
  // failing the whole turn.
  for (let attempt = 0; attempt < SEQUENCE_CONFLICT_MAX_ATTEMPTS; attempt += 1) {
    const nextSequenceIndex = await repository.getNextSessionMessageSequenceIndex(context, input.sessionId);

    if (!nextSequenceIndex.ok) {
      return nextSequenceIndex;
    }

    const userSequenceIndex = nextSequenceIndex.data;
    const assistantSequenceIndex = userSequenceIndex + 1;
    insertedMessages = await repository.appendSessionMessages(context, [
      {
        sessionId: input.sessionId,
        role: "user",
        sequenceIndex: userSequenceIndex,
        content: input.userMessage,
      },
      {
        sessionId: input.sessionId,
        role: "assistant",
        sequenceIndex: assistantSequenceIndex,
        content: input.assistantMessage,
      },
    ]);

    if (insertedMessages.ok || insertedMessages.error.code !== "sequence_conflict") {
      break;
    }
  }

  if (!insertedMessages) {
    return {
      ok: false,
      error: {
        code: "write_failed",
      },
    };
  }

  if (!insertedMessages.ok) {
    return insertedMessages.error.code === "sequence_conflict"
      ? { ok: false, error: { code: "write_failed" } }
      : insertedMessages;
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
