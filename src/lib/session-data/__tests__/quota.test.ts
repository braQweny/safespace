import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "../errors";
import { claimFreeTrialSession, readTrialAvailability, type QuotaRepository } from "../quota";
import type { DeletedSessionTombstone, SessionDataContext, SessionMetadata, SessionTrialClaimState } from "../types";

const context = {} as SessionDataContext;

const session: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "created",
  startedAt: null,
  endedAt: null,
  expiresAt: null,
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: null,
  durationBucketSeconds: 900,
  createdAt: "2026-06-06T09:59:00.000Z",
  updatedAt: "2026-06-06T09:59:00.000Z",
};

const claim: SessionTrialClaimState = {
  id: "claim-1",
  sessionId: "session-1",
  userId: "user-1",
  trialDurationSeconds: 900,
  claimedAt: "2026-06-06T10:00:00.000Z",
  createdAt: "2026-06-06T10:00:00.000Z",
};

const tombstone: DeletedSessionTombstone = {
  id: "session-1",
  userId: "user-1",
  status: "deleted",
  startedAt: null,
  endedAt: null,
  expiresAt: null,
  deletedAt: "2026-06-06T10:01:00.000Z",
  deletionReasonCode: "system_cleanup",
  isTrial: true,
  trialClaimId: null,
  durationBucketSeconds: 900,
  createdAt: "2026-06-06T09:59:00.000Z",
  updatedAt: "2026-06-06T10:01:00.000Z",
};

function createRepository(overrides: Partial<QuotaRepository> = {}): QuotaRepository {
  return {
    createPendingSession: vi.fn(() => Promise.resolve(ok(session))),
    createSessionTrialClaim: vi.fn(() => Promise.resolve(ok(claim))),
    getOwnedSessionMetadata: vi.fn(() =>
      Promise.resolve(
        ok({
          ...session,
          trialClaimId: claim.id,
        }),
      ),
    ),
    getTrialAvailability: vi.fn(() =>
      Promise.resolve(
        ok({
          isAvailable: true,
          existingClaim: null,
        }),
      ),
    ),
    updateSessionTombstone: vi.fn(() => Promise.resolve(ok(tombstone))),
    ...overrides,
  };
}

describe("session trial quota helpers", () => {
  it("reads trial availability through the repository boundary", async () => {
    const repository = createRepository();

    const result = await readTrialAvailability(context, repository);

    expect(result).toEqual(
      ok({
        isAvailable: true,
        existingClaim: null,
      }),
    );
    expect(repository.getTrialAvailability).toHaveBeenCalledWith(context);
  });

  it("claims a trial session through the database-backed claim operation", async () => {
    const repository = createRepository();

    const result = await claimFreeTrialSession(context, {}, repository);

    expect(result).toEqual(
      ok({
        session: {
          ...session,
          trialClaimId: claim.id,
        },
        trialClaim: claim,
      }),
    );
    expect(repository.createPendingSession).toHaveBeenCalledWith(context, {
      modalityId: null,
      avatarId: null,
      isTrial: true,
      startedAt: null,
      expiresAt: null,
      durationBucketSeconds: 900,
    });
    expect(repository.createSessionTrialClaim).toHaveBeenCalledWith(context, "session-1");
  });

  it("maps duplicate trial claims to a stable code and tombstones the attempted session", async () => {
    const repository = createRepository({
      createSessionTrialClaim: vi.fn(() => Promise.resolve(sessionDataError("trial_already_claimed"))),
    });

    const result = await claimFreeTrialSession(context, {}, repository);

    expect(result).toEqual(sessionDataError("trial_already_claimed"));
    expect(repository.updateSessionTombstone).toHaveBeenCalledWith(context, {
      sessionId: "session-1",
      deletionReasonCode: "system_cleanup",
      durationBucketSeconds: 900,
    });
  });
});
