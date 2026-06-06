import { describe, expect, it, vi } from "vitest";
import { deleteOwnedSession, type DeletionRepository } from "../deletion";
import { ok, sessionDataError } from "../errors";
import type { DeletedSessionTombstone, SessionDataContext, SessionMetadata } from "../types";

const context = {} as SessionDataContext;

const activeSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-06T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-06T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-06T09:59:00.000Z",
  updatedAt: "2026-06-06T10:00:00.000Z",
};

const tombstone: DeletedSessionTombstone = {
  id: "session-1",
  userId: "user-1",
  status: "deleted",
  startedAt: "2026-06-06T10:00:00.000Z",
  endedAt: "2026-06-06T10:05:00.000Z",
  expiresAt: "2026-06-06T10:15:00.000Z",
  deletedAt: "2026-06-06T10:06:00.000Z",
  deletionReasonCode: "user_request",
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-06T09:59:00.000Z",
  updatedAt: "2026-06-06T10:06:00.000Z",
};

describe("deleteOwnedSession", () => {
  it("purges private rows before writing the safe tombstone", async () => {
    const calls: string[] = [];
    const repository: DeletionRepository = {
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(activeSession))),
      purgeOwnedSessionMessages: vi.fn(() => {
        calls.push("messages");
        return Promise.resolve(ok(null));
      }),
      purgeOwnedSessionSummaries: vi.fn(() => {
        calls.push("summaries");
        return Promise.resolve(ok(null));
      }),
      updateSessionTombstone: vi.fn(() => {
        calls.push("tombstone");
        return Promise.resolve(ok(tombstone));
      }),
    };

    const result = await deleteOwnedSession(
      context,
      {
        sessionId: "session-1",
        deletionReasonCode: "user_request",
        endedAt: "2026-06-06T10:05:00.000Z",
        durationBucketSeconds: 900,
      },
      repository,
    );

    expect(result).toEqual(ok(tombstone));
    expect(calls).toEqual(["messages", "summaries", "tombstone"]);
    expect(result.ok ? result.data : null).not.toHaveProperty("modalityId");
    expect(result.ok ? result.data : null).not.toHaveProperty("avatarId");
  });

  it("rejects already deleted sessions without purging again", async () => {
    const repository: DeletionRepository = {
      getOwnedSessionMetadata: vi.fn(() =>
        Promise.resolve(
          ok({
            ...activeSession,
            modalityId: null,
            avatarId: null,
            status: "deleted",
            deletedAt: "2026-06-06T10:06:00.000Z",
            deletionReasonCode: "user_request",
          }),
        ),
      ),
      purgeOwnedSessionMessages: vi.fn(() => Promise.resolve(ok(null))),
      purgeOwnedSessionSummaries: vi.fn(() => Promise.resolve(ok(null))),
      updateSessionTombstone: vi.fn(() => Promise.resolve(ok(tombstone))),
    };

    const result = await deleteOwnedSession(
      context,
      {
        sessionId: "session-1",
        deletionReasonCode: "user_request",
      },
      repository,
    );

    expect(result).toEqual(sessionDataError("invalid_lifecycle_transition"));
    expect(repository.purgeOwnedSessionMessages).not.toHaveBeenCalled();
    expect(repository.purgeOwnedSessionSummaries).not.toHaveBeenCalled();
    expect(repository.updateSessionTombstone).not.toHaveBeenCalled();
  });
});
