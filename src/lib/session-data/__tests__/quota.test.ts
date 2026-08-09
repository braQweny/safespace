import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "../errors";
import { claimFreeTrialSession, readTrialAvailability, type QuotaRepository } from "../quota";
import type { SessionDataContext, SessionMetadata, SessionTrialClaimState } from "../types";

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
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  usesApprovedContext: true,
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

function createRepository(overrides: Partial<QuotaRepository> = {}): QuotaRepository {
  return {
    claimFreeTrialSessionAtomic: vi.fn(() =>
      Promise.resolve(
        ok({
          session,
          trialClaim: claim,
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

  it("claims a trial session through the atomic database operation", async () => {
    const repository = createRepository();

    const result = await claimFreeTrialSession(
      context,
      {
        modalityId: "cbt",
        avatarId: "cbt-guide",
        startedAt: "2026-06-06T10:00:00.000Z",
        expiresAt: "2026-06-06T10:15:00.000Z",
      },
      repository,
    );

    expect(result).toEqual(
      ok({
        session,
        trialClaim: claim,
      }),
    );
    expect(repository.claimFreeTrialSessionAtomic).toHaveBeenCalledWith(context, {
      modalityId: "cbt",
      avatarId: "cbt-guide",
      startedAt: "2026-06-06T10:00:00.000Z",
      expiresAt: "2026-06-06T10:15:00.000Z",
    });
  });

  it("maps duplicate trial claims to a stable code", async () => {
    const repository = createRepository({
      claimFreeTrialSessionAtomic: vi.fn(() => Promise.resolve(sessionDataError("trial_already_claimed"))),
    });

    const result = await claimFreeTrialSession(context, {}, repository);

    expect(result).toEqual(sessionDataError("trial_already_claimed"));
    expect(repository.claimFreeTrialSessionAtomic).toHaveBeenCalledWith(context, {
      modalityId: null,
      avatarId: null,
      startedAt: null,
      expiresAt: null,
    });
  });
});
