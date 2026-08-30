import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "../errors";
import {
  FREE_PLAN_SESSION_LIMIT,
  claimFreeTrialSession,
  readSessionQuota,
  readTrialAvailability,
  toSessionQuota,
  type QuotaRepository,
} from "../quota";
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
    getOwnedAccountPlan: vi.fn(() =>
      Promise.resolve(
        ok({
          plan: "free" as const,
          premiumGrantedAt: null,
        }),
      ),
    ),
    countOwnedSessions: vi.fn(() => Promise.resolve(ok(0))),
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
      durationBucketSeconds: null,
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
      durationBucketSeconds: null,
    });
  });

  it("passes the database session-limit rejection through unchanged", async () => {
    const repository = createRepository({
      claimFreeTrialSessionAtomic: vi.fn(() => Promise.resolve(sessionDataError("session_limit_reached"))),
    });

    await expect(claimFreeTrialSession(context, {}, repository)).resolves.toEqual(
      sessionDataError("session_limit_reached"),
    );
  });
});

describe("free-plan session quota", () => {
  it("caps free accounts at the free-plan limit, counting every owned session", () => {
    expect(FREE_PLAN_SESSION_LIMIT).toBe(3);
    expect(toSessionQuota("free", 0)).toEqual({
      plan: "free",
      sessionLimit: 3,
      usedSessions: 0,
      remainingSessions: 3,
      canStartSession: true,
    });
    expect(toSessionQuota("free", 2)).toMatchObject({
      remainingSessions: 1,
      canStartSession: true,
    });
    expect(toSessionQuota("free", 3)).toMatchObject({
      usedSessions: 3,
      remainingSessions: 0,
      canStartSession: false,
    });
    // More sessions than the limit (e.g. granted premium, then revoked) stays
    // a clean "nothing left", never a negative remainder.
    expect(toSessionQuota("free", 7)).toMatchObject({
      usedSessions: 7,
      remainingSessions: 0,
      canStartSession: false,
    });
  });

  it("never caps premium accounts", () => {
    expect(toSessionQuota("premium", 0)).toEqual({
      plan: "premium",
      sessionLimit: null,
      usedSessions: 0,
      remainingSessions: null,
      canStartSession: true,
    });
    expect(toSessionQuota("premium", 42)).toMatchObject({
      usedSessions: 42,
      sessionLimit: null,
      canStartSession: true,
    });
  });

  it("sanitises a malformed count instead of trusting it", () => {
    expect(toSessionQuota("free", -4)).toMatchObject({ usedSessions: 0, remainingSessions: 3 });
    expect(toSessionQuota("free", 1.9)).toMatchObject({ usedSessions: 1, remainingSessions: 2 });
  });

  it("reads plan and owned session count through the repository boundary", async () => {
    const repository = createRepository({
      countOwnedSessions: vi.fn(() => Promise.resolve(ok(2))),
    });

    const result = await readSessionQuota(context, repository);

    expect(result).toEqual(
      ok({
        plan: "free",
        sessionLimit: 3,
        usedSessions: 2,
        remainingSessions: 1,
        canStartSession: true,
      }),
    );
    expect(repository.getOwnedAccountPlan).toHaveBeenCalledWith(context);
    expect(repository.countOwnedSessions).toHaveBeenCalledWith(context);
  });

  it("reports an uncapped quota for premium accounts", async () => {
    const repository = createRepository({
      getOwnedAccountPlan: vi.fn(() =>
        Promise.resolve(ok({ plan: "premium" as const, premiumGrantedAt: "2026-08-01T10:00:00.000Z" })),
      ),
      countOwnedSessions: vi.fn(() => Promise.resolve(ok(9))),
    });

    await expect(readSessionQuota(context, repository)).resolves.toEqual(
      ok({
        plan: "premium",
        sessionLimit: null,
        usedSessions: 9,
        remainingSessions: null,
        canStartSession: true,
      }),
    );
  });

  it("propagates read failures with stable codes", async () => {
    await expect(
      readSessionQuota(
        context,
        createRepository({
          getOwnedAccountPlan: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
        }),
      ),
    ).resolves.toEqual(sessionDataError("read_failed"));

    await expect(
      readSessionQuota(
        context,
        createRepository({
          countOwnedSessions: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
        }),
      ),
    ).resolves.toEqual(sessionDataError("read_failed"));
  });
});
