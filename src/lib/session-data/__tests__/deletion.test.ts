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
  usesApprovedContext: true,
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
  it("purges private rows and writes the safe tombstone through one atomic operation", async () => {
    const repository: DeletionRepository = {
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(activeSession))),
      purgeAndTombstoneOwnedSession: vi.fn(() => Promise.resolve(ok(tombstone))),
    };

    const input = {
      sessionId: "session-1",
      deletionReasonCode: "user_request",
      endedAt: "2026-06-06T10:05:00.000Z",
      durationBucketSeconds: 900,
    } as const;

    const result = await deleteOwnedSession(context, input, repository);

    expect(result).toEqual(ok(tombstone));
    expect(repository.purgeAndTombstoneOwnedSession).toHaveBeenCalledWith(context, input);
    expect(result.ok ? result.data : null).not.toHaveProperty("modalityId");
    expect(result.ok ? result.data : null).not.toHaveProperty("avatarId");
  });

  it("rejects already deleted sessions without purging again", async () => {
    const repository: DeletionRepository = {
      getOwnedSessionMetadata: vi.fn(() =>
        Promise.resolve(
          ok<SessionMetadata>({
            ...activeSession,
            modalityId: null,
            avatarId: null,
            status: "deleted",
            deletedAt: "2026-06-06T10:06:00.000Z",
            deletionReasonCode: "user_request",
          }),
        ),
      ),
      purgeAndTombstoneOwnedSession: vi.fn(() => Promise.resolve(ok(tombstone))),
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
    expect(repository.purgeAndTombstoneOwnedSession).not.toHaveBeenCalled();
  });

  it("maps an atomic purge failure to delete_failed", async () => {
    const repository: DeletionRepository = {
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(activeSession))),
      purgeAndTombstoneOwnedSession: vi.fn(() => Promise.resolve(sessionDataError("write_failed"))),
    };

    const result = await deleteOwnedSession(
      context,
      {
        sessionId: "session-1",
        deletionReasonCode: "user_request",
      },
      repository,
    );

    expect(result).toEqual(sessionDataError("delete_failed"));
  });
});
