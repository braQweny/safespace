import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord } from "@/lib/session-data/types";
import {
  persistOpeningMessage,
  persistSuccessfulMessageTurn,
  toSessionMessageViewModel,
  type MessagePersistenceRepository,
  type PersistSuccessfulMessageTurnInput,
} from "../message-persistence";

const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const input: PersistSuccessfulMessageTurnInput = {
  sessionId: "session-1",
  userMessage: "wiadomosc-uzytkownika",
  assistantMessage: "odpowiedz-asystenta",
  clientMessageId: "client-message-1",
  attemptId: "attempt-1",
  responseType: "success",
};

function createMessageRecord(overrides: Partial<SessionMessageRecord> = {}): SessionMessageRecord {
  return {
    id: "message-0",
    sessionId: "session-1",
    userId: "user-1",
    role: "user",
    sequenceIndex: 0,
    content: "tresc-wiadomosci",
    createdAt: "2026-06-07T10:00:00.000Z",
    ...overrides,
  };
}

function createInsertedTurn(userSequenceIndex: number): SessionMessageRecord[] {
  return [
    createMessageRecord({
      id: `message-${userSequenceIndex}`,
      role: "user",
      sequenceIndex: userSequenceIndex,
      content: input.userMessage,
    }),
    createMessageRecord({
      id: `message-${userSequenceIndex + 1}`,
      role: "assistant",
      sequenceIndex: userSequenceIndex + 1,
      content: input.assistantMessage,
    }),
  ];
}

function createRepository(overrides: Partial<MessagePersistenceRepository> = {}): MessagePersistenceRepository {
  return {
    getNextSessionMessageSequenceIndex: vi.fn(() => Promise.resolve(ok(0))),
    appendSessionMessages: vi.fn(() => Promise.resolve(ok(createInsertedTurn(0)))),
    ...overrides,
  };
}

describe("toSessionMessageViewModel", () => {
  it("maps user and assistant records to view models", () => {
    expect(toSessionMessageViewModel(createMessageRecord({ role: "assistant", sequenceIndex: 3 }))).toEqual({
      id: "message-0",
      role: "assistant",
      sequenceIndex: 3,
      content: "tresc-wiadomosci",
      createdAt: "2026-06-07T10:00:00.000Z",
    });
  });

  it("hides system boundary records from the conversation view", () => {
    expect(toSessionMessageViewModel(createMessageRecord({ role: "system_boundary" }))).toBeNull();
  });
});

describe("persistOpeningMessage", () => {
  const openingInput = { sessionId: "session-1", assistantMessage: "otwarcie-avatara" };

  it("persists a single assistant message as the first message of the session", async () => {
    const repository = createRepository({
      appendSessionMessages: vi.fn(() =>
        Promise.resolve(
          ok([
            createMessageRecord({
              id: "message-opening",
              role: "assistant",
              sequenceIndex: 0,
              content: "otwarcie-avatara",
            }),
          ]),
        ),
      ),
    });

    const result = await persistOpeningMessage(context, openingInput, repository);

    expect(repository.appendSessionMessages).toHaveBeenCalledWith(context, [
      {
        sessionId: "session-1",
        role: "assistant",
        sequenceIndex: 0,
        content: "otwarcie-avatara",
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      data: {
        role: "assistant",
        sequenceIndex: 0,
        content: "otwarcie-avatara",
      },
    });
  });

  it("does not retry when the append fails with a sequence conflict", async () => {
    const appendSessionMessages = vi.fn(() => Promise.resolve(sessionDataError("sequence_conflict")));
    const repository = createRepository({ appendSessionMessages });

    const result = await persistOpeningMessage(context, openingInput, repository);

    expect(appendSessionMessages).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "sequence_conflict",
      },
    });
  });

  it("propagates a failed sequence index read without appending", async () => {
    const repository = createRepository({
      getNextSessionMessageSequenceIndex: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    const result = await persistOpeningMessage(context, openingInput, repository);

    expect(repository.appendSessionMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        code: "read_failed",
      },
    });
  });
});

describe("persistSuccessfulMessageTurn", () => {
  it("returns both private message records as public view models after an atomic commit", async () => {
    const repository = { completeSessionMessageTurn: vi.fn(() => Promise.resolve(ok(createInsertedTurn(5)))) };
    const result = await persistSuccessfulMessageTurn(context, input, repository);
    expect(repository.completeSessionMessageTurn).toHaveBeenCalledWith(context, input);
    expect(result).toMatchObject({
      ok: true,
      data: {
        user: { role: "user", sequenceIndex: 5 },
        assistant: { role: "assistant", sequenceIndex: 6 },
      },
    });
    if (result.ok) {
      expect(result.data.user).not.toHaveProperty("userId");
      expect(result.data.assistant).not.toHaveProperty("sessionId");
    }
  });

  it.each(["invalid_lifecycle_transition", "session_expired", "message_request_conflict", "write_failed"] as const)(
    "propagates %s without trying a separate unguarded insert",
    async (code) => {
      const repository = { completeSessionMessageTurn: vi.fn(() => Promise.resolve(sessionDataError(code))) };
      await expect(persistSuccessfulMessageTurn(context, input, repository)).resolves.toEqual(sessionDataError(code));
      expect(repository.completeSessionMessageTurn).toHaveBeenCalledOnce();
    },
  );

  it("refuses a malformed result missing one side of the turn", async () => {
    const repository = { completeSessionMessageTurn: vi.fn(() => Promise.resolve(ok([createMessageRecord()]))) };
    await expect(persistSuccessfulMessageTurn(context, input, repository)).resolves.toEqual(
      sessionDataError("write_failed"),
    );
  });
});
