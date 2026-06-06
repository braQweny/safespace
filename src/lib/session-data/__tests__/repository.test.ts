import { describe, expect, it } from "vitest";
import { mapSupabaseReadError, mapSupabaseWriteError } from "../errors";
import { canTransitionSessionLifecycle, toDeletedSessionTombstone } from "../repository";
import type { SessionMetadata } from "../types";

const baseSession: SessionMetadata = {
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

describe("session data repository pure helpers", () => {
  it("allows expected lifecycle transitions", () => {
    expect(canTransitionSessionLifecycle("created", "active")).toBe(true);
    expect(canTransitionSessionLifecycle("active", "completed")).toBe(true);
    expect(canTransitionSessionLifecycle("completed", "deleted")).toBe(true);
  });

  it("rejects invalid lifecycle transitions", () => {
    expect(canTransitionSessionLifecycle("completed", "active")).toBe(false);
    expect(canTransitionSessionLifecycle("deleted", "active")).toBe(false);
  });

  it("maps deleted sessions to a safe tombstone shape", () => {
    const tombstone = toDeletedSessionTombstone({
      ...baseSession,
      modalityId: null,
      avatarId: null,
      status: "deleted",
      endedAt: "2026-06-06T10:05:00.000Z",
      deletedAt: "2026-06-06T10:06:00.000Z",
      deletionReasonCode: "user_request",
    });

    expect(tombstone).toEqual({
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
      updatedAt: "2026-06-06T10:00:00.000Z",
    });
    expect(tombstone).not.toHaveProperty("modalityId");
    expect(tombstone).not.toHaveProperty("avatarId");
  });

  it("maps database errors to stable codes", () => {
    expect(mapSupabaseReadError({ code: "PGRST116" })).toBe("session_not_found");
    expect(mapSupabaseWriteError({ code: "23503" })).toBe("session_not_found");
    expect(mapSupabaseWriteError({ code: "23505" }, { conflictCode: "trial_already_claimed" })).toBe(
      "trial_already_claimed",
    );
    expect(mapSupabaseWriteError({ code: "23505" })).toBe("write_failed");
  });
});
