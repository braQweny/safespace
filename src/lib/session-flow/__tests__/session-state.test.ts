import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import {
  computeRemainingSeconds,
  getEffectiveSessionStatus,
  readSessionStartPageState,
  type SessionStateRepository,
} from "../session-state";
import type {
  SessionDataContext,
  SessionMessageRecord,
  SessionMetadata,
  SessionTrialClaimState,
} from "@/lib/session-data/types";
import type { CurrentAvatarChoice } from "../avatar-choice";

const now = new Date("2026-06-07T10:00:00.000Z");
const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const avatar: CurrentAvatarChoice = {
  modality: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    explanation: "Pomaga zauważać powiązania między myślami, emocjami, reakcjami ciała i codziennymi działaniami.",
    focus: "Porządkuje sytuacje krok po kroku i szuka konkretnych obserwacji, które da się nazwać.",
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
  selected: {
    modalityId: "cbt",
    avatarId: "cbt-guide",
    modalityName: "Podejście poznawczo-behawioralne",
    avatarName: "Marek, praktyczny przewodnik",
    assetPath: "/avatars/cbt-guide.png",
    altText: "Ilustracyjny portret neutralnego awatara Marka z notesem",
  },
};

const claim: SessionTrialClaimState = {
  id: "claim-1",
  sessionId: "session-1",
  userId: "user-1",
  trialDurationSeconds: 900,
  claimedAt: "2026-06-07T09:59:00.000Z",
  createdAt: "2026-06-07T09:59:00.000Z",
};

const activeSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-07T09:55:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:10:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  usesApprovedContext: true,
  createdAt: "2026-06-07T09:55:00.000Z",
  updatedAt: "2026-06-07T09:55:00.000Z",
};

const message: SessionMessageRecord = {
  id: "message-1",
  sessionId: "session-1",
  userId: "user-1",
  role: "user",
  sequenceIndex: 1,
  content: "Chce spokojnie opisac sytuacje.",
  createdAt: "2026-06-07T09:56:00.000Z",
};

function createRepository(overrides: Partial<SessionStateRepository> = {}): SessionStateRepository {
  return {
    readTrialAvailability: vi.fn(() =>
      Promise.resolve(
        ok({
          isAvailable: true,
          existingClaim: null,
        }),
      ),
    ),
    getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(activeSession))),
    listOwnedActiveSessionMetadata: vi.fn(() => Promise.resolve(ok([]))),
    listOwnedSessionMessages: vi.fn(() => Promise.resolve(ok([message]))),
    listNewestApprovedSessionSummaryContexts: vi.fn(() => Promise.resolve(ok([]))),
    ...overrides,
  };
}

describe("session time helpers", () => {
  it("computes remaining seconds from server timestamps", () => {
    expect(computeRemainingSeconds("2026-06-07T10:01:30.000Z", now)).toBe(90);
    expect(computeRemainingSeconds("2026-06-07T09:59:59.000Z", now)).toBe(0);
    expect(computeRemainingSeconds(null, now)).toBeNull();
  });

  it("treats active sessions past expiresAt as effectively expired", () => {
    expect(getEffectiveSessionStatus(activeSession, now)).toBe("active");
    expect(getEffectiveSessionStatus({ ...activeSession, expiresAt: "2026-06-07T09:59:59.000Z" }, now)).toBe("expired");
  });
});

describe("readSessionStartPageState", () => {
  it("returns ready state when the trial has not been claimed", async () => {
    const result = await readSessionStartPageState(context, { avatar, now }, createRepository());

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "ready",
        trialAvailable: true,
        session: null,
        approvedSummaries: [],
        canStartWithoutContext: false,
      },
    });
  });

  it("returns active state and owned messages for an active claimed trial", async () => {
    const repository = createRepository({
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: false,
            existingClaim: claim,
          }),
        ),
      ),
    });

    const result = await readSessionStartPageState(
      context,
      {
        avatar,
        includeMessagesForActive: true,
        now,
      },
      repository,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "active",
        trialAvailable: false,
        session: {
          id: "session-1",
          status: "active",
          remainingSeconds: 600,
        },
        messages: [
          {
            id: "message-1",
            content: "Chce spokojnie opisac sytuacje.",
          },
        ],
        approvedSummaries: [],
        canStartWithoutContext: false,
      },
    });
  });

  it("returns active state for an explicit active follow-up session", async () => {
    const followupSession: SessionMetadata = {
      ...activeSession,
      id: "followup-session-1",
      isTrial: false,
      trialClaimId: null,
      createdAt: "2026-06-07T09:59:30.000Z",
    };
    const repository = createRepository({
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(followupSession))),
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: true,
            existingClaim: null,
          }),
        ),
      ),
    });

    const result = await readSessionStartPageState(
      context,
      {
        avatar,
        includeMessagesForActive: true,
        resumeSessionId: "followup-session-1",
        now,
      },
      repository,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "active",
        trialAvailable: false,
        session: {
          id: "followup-session-1",
          status: "active",
          remainingSeconds: 600,
          isTrial: false,
        },
        messages: [
          {
            id: "message-1",
            content: "Chce spokojnie opisac sytuacje.",
          },
        ],
      },
    });
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
  });

  it("returns expired state for an explicit follow-up session past the server expiry", async () => {
    const followupSession: SessionMetadata = {
      ...activeSession,
      id: "followup-session-1",
      expiresAt: "2026-06-07T09:59:59.000Z",
      isTrial: false,
      trialClaimId: null,
    };
    const repository = createRepository({
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(followupSession))),
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: true,
            existingClaim: null,
          }),
        ),
      ),
    });

    const result = await readSessionStartPageState(
      context,
      {
        avatar,
        includeMessagesForActive: true,
        resumeSessionId: "followup-session-1",
        now,
      },
      repository,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "expired",
        trialAvailable: false,
        session: {
          id: "followup-session-1",
          status: "expired",
          remainingSeconds: 0,
          isTrial: false,
        },
        messages: [
          {
            id: "message-1",
            content: "Chce spokojnie opisac sytuacje.",
          },
        ],
      },
    });
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
  });

  it("returns latest active session for the selected avatar before checking trial availability", async () => {
    const followupSession: SessionMetadata = {
      ...activeSession,
      id: "followup-session-1",
      isTrial: false,
      trialClaimId: null,
      createdAt: "2026-06-07T09:59:30.000Z",
    };
    const repository = createRepository({
      listOwnedActiveSessionMetadata: vi.fn(() => Promise.resolve(ok([followupSession]))),
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: true,
            existingClaim: null,
          }),
        ),
      ),
    });

    const result = await readSessionStartPageState(
      context,
      {
        avatar,
        includeMessagesForActive: true,
        now,
      },
      repository,
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "active",
        session: {
          id: "followup-session-1",
          status: "active",
          isTrial: false,
        },
      },
    });
    expect(repository.listOwnedActiveSessionMetadata).toHaveBeenCalledWith(context, {
      avatarId: "cbt-guide",
      limit: 5,
    });
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
  });

  it("returns follow-up preparation when the claimed active session is past the server expiry", async () => {
    const repository = createRepository({
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: false,
            existingClaim: claim,
          }),
        ),
      ),
      getOwnedSessionMetadata: vi.fn(() =>
        Promise.resolve(
          ok({
            ...activeSession,
            expiresAt: "2026-06-07T09:59:59.000Z",
          }),
        ),
      ),
      listNewestApprovedSessionSummaryContexts: vi.fn(() =>
        Promise.resolve(
          ok([
            {
              id: "summary-1",
              sessionId: "session-1",
              summaryText: "Zatwierdzone podsumowanie do kolejnej sesji.",
              revision: 1,
              createdAt: "2026-06-07T09:58:00.000Z",
              updatedAt: "2026-06-07T09:58:00.000Z",
            },
          ]),
        ),
      ),
    });

    const result = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "followup_ready",
        trialAvailable: false,
        session: null,
        approvedSummaries: [
          {
            summaryText: "Zatwierdzone podsumowanie do kolejnej sesji.",
          },
        ],
        // The opt-out stays available even when there is context to carry over.
        canStartWithoutContext: true,
      },
    });
  });

  it("returns follow-up no-context fallback when a claim exists but metadata is unavailable", async () => {
    const repository = createRepository({
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: false,
            existingClaim: claim,
          }),
        ),
      ),
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(sessionDataError("session_not_found"))),
    });

    const result = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "followup_ready",
        trialAvailable: false,
        session: null,
        approvedSummaries: [],
        canStartWithoutContext: true,
      },
    });
  });
});
