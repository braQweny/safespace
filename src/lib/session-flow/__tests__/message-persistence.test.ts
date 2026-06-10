import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord } from "@/lib/session-data/types";
import {
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
    listOwnedSessionMessages: vi.fn(() => Promise.resolve(ok([] as SessionMessageRecord[]))),
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

describe("persistSuccessfulMessageTurn", () => {
  it("appends the turn after the highest existing sequence index", async () => {
    const repository = createRepository({
      listOwnedSessionMessages: vi.fn(() =>
        Promise.resolve(
          ok([
            createMessageRecord({ sequenceIndex: 0 }),
            createMessageRecord({ id: "message-1", role: "assistant", sequenceIndex: 4 }),
          ]),
        ),
      ),
      appendSessionMessages: vi.fn(() => Promise.resolve(ok(createInsertedTurn(5)))),
    });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(repository.appendSessionMessages).toHaveBeenCalledTimes(1);
    expect(repository.appendSessionMessages).toHaveBeenCalledWith(context, [
      {
        sessionId: "session-1",
        role: "user",
        sequenceIndex: 5,
        content: input.userMessage,
      },
      {
        sessionId: "session-1",
        role: "assistant",
        sequenceIndex: 6,
        content: input.assistantMessage,
      },
    ]);
    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          role: "user",
          sequenceIndex: 5,
        },
        assistant: {
          role: "assistant",
          sequenceIndex: 6,
        },
      },
    });
  });

  it("starts the sequence at zero for an empty conversation", async () => {
    const repository = createRepository();

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(repository.appendSessionMessages).toHaveBeenCalledWith(context, [
      expect.objectContaining({ role: "user", sequenceIndex: 0 }),
      expect.objectContaining({ role: "assistant", sequenceIndex: 1 }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("re-reads messages and retries once after a sequence conflict", async () => {
    const listOwnedSessionMessages = vi
      .fn()
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([createMessageRecord({ sequenceIndex: 1 })]));
    const appendSessionMessages = vi
      .fn()
      .mockResolvedValueOnce(sessionDataError("sequence_conflict"))
      .mockResolvedValueOnce(ok(createInsertedTurn(2)));
    const repository = createRepository({ listOwnedSessionMessages, appendSessionMessages });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(listOwnedSessionMessages).toHaveBeenCalledTimes(2);
    expect(appendSessionMessages).toHaveBeenCalledTimes(2);
    expect(appendSessionMessages).toHaveBeenLastCalledWith(context, [
      expect.objectContaining({ role: "user", sequenceIndex: 2 }),
      expect.objectContaining({ role: "assistant", sequenceIndex: 3 }),
    ]);
    expect(result).toMatchObject({
      ok: true,
      data: {
        user: {
          sequenceIndex: 2,
        },
        assistant: {
          sequenceIndex: 3,
        },
      },
    });
  });

  it("returns write_failed after exhausting the sequence conflict attempts", async () => {
    const repository = createRepository({
      appendSessionMessages: vi.fn(() => Promise.resolve(sessionDataError("sequence_conflict"))),
    });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(repository.appendSessionMessages).toHaveBeenCalledTimes(3);
    expect(repository.listOwnedSessionMessages).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "write_failed",
      },
    });
  });

  it("does not retry non-conflict append failures", async () => {
    const repository = createRepository({
      appendSessionMessages: vi.fn(() => Promise.resolve(sessionDataError("session_not_found"))),
    });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(repository.appendSessionMessages).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "session_not_found",
      },
    });
  });

  it("stops before appending when the message read fails", async () => {
    const repository = createRepository({
      listOwnedSessionMessages: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(repository.appendSessionMessages).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: {
        code: "read_failed",
      },
    });
  });

  it("returns write_failed when the insert result is missing one side of the turn", async () => {
    const repository = createRepository({
      appendSessionMessages: vi.fn(() =>
        Promise.resolve(ok([createMessageRecord({ role: "user", sequenceIndex: 0, content: input.userMessage })])),
      ),
    });

    const result = await persistSuccessfulMessageTurn(context, input, repository);

    expect(result).toEqual({
      ok: false,
      error: {
        code: "write_failed",
      },
    });
  });
});
