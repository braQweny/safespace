import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import {
  computeRemainingSeconds,
  getEffectiveSessionStatus,
  readSessionStartPageState,
  toSessionView,
  type SessionStateRepository,
} from "../session-state";
import type {
  SessionDataContext,
  SessionMessageRecord,
  SessionMetadata,
  SessionQuota,
  SessionTrialClaimState,
} from "@/lib/session-data/types";
import type { CurrentAvatarChoice } from "../avatar-choice";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";

const freeQuota: SessionQuota = {
  plan: "free",
  sessionLimit: 3,
  usedSessions: 1,
  remainingSessions: 2,
  canStartSession: true,
};

const exhaustedQuota: SessionQuota = {
  plan: "free",
  sessionLimit: 3,
  usedSessions: 3,
  remainingSessions: 0,
  canStartSession: false,
};

const premiumQuota: SessionQuota = {
  plan: "premium",
  sessionLimit: null,
  usedSessions: 12,
  remainingSessions: null,
  canStartSession: true,
};

const now = new Date("2026-06-07T10:00:00.000Z");
const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

// Katalog jest jedynym źródłem kształtu perspektywy; testy dokładają tylko krótkie hinty.
const CBT_MODALITY = MVP_MODALITIES.find((modality) => modality.modalityId === "cbt") ?? MVP_MODALITIES[1];
const avatar: CurrentAvatarChoice = {
  modality: {
    ...CBT_MODALITY,
    sessionStyleHint: "Uzywa jasnej struktury.",
    summaryLensHint: "Podsumuj przez soczewke poznawczo-behawioralna.",
  },
  selected: toSelectedModalityAvatar(CBT_MODALITY),
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
    readSessionQuota: vi.fn(() => Promise.resolve(ok(freeQuota))),
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
  it("returns ready state with the free-plan quota when the trial has not been claimed", async () => {
    const result = await readSessionStartPageState(context, { avatar, now }, createRepository());

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "ready",
        trialAvailable: true,
        session: null,
        approvedSummaries: [],
        canStartWithoutContext: false,
        sessionQuota: freeQuota,
      },
    });
  });

  it("returns the limit-reached state and offers no start once the free allowance is used up", async () => {
    const repository = createRepository({
      readSessionQuota: vi.fn(() => Promise.resolve(ok(exhaustedQuota))),
    });

    const result = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(result).toEqual({
      ok: true,
      data: {
        kind: "session_limit_reached",
        trialAvailable: false,
        avatar,
        session: null,
        messages: [],
        messageFetchFailed: false,
        approvedSummaries: [],
        canStartWithoutContext: false,
        sessionQuota: exhaustedQuota,
      },
    });
    // Nothing to carry context into, so neither the trial nor the summaries are read.
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
    expect(repository.listNewestApprovedSessionSummaryContexts).not.toHaveBeenCalled();
  });

  it("keeps offering starts to premium accounts regardless of how many sessions they own", async () => {
    const repository = createRepository({
      readSessionQuota: vi.fn(() => Promise.resolve(ok(premiumQuota))),
      readTrialAvailability: vi.fn(() =>
        Promise.resolve(
          ok({
            isAvailable: false,
            existingClaim: claim,
          }),
        ),
      ),
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok({ ...activeSession, status: "completed" as const }))),
    });

    const result = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "followup_ready",
        canStartWithoutContext: false,
        sessionQuota: premiumQuota,
      },
    });
  });

  it("reports an unavailable state when the quota cannot be read", async () => {
    const repository = createRepository({
      readSessionQuota: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
    });

    const result = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(result).toMatchObject({
      ok: true,
      data: {
        kind: "unavailable",
        sessionQuota: null,
      },
    });
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
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
        sessionQuota: null,
      },
    });
    expect(repository.listOwnedActiveSessionMetadata).toHaveBeenCalledWith(context, {
      avatarId: "cbt-guide",
      limit: 5,
    });
    expect(repository.readTrialAvailability).not.toHaveBeenCalled();
    // An ongoing conversation is shown as is; the allowance only matters for a start.
    expect(repository.readSessionQuota).not.toHaveBeenCalled();
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
        approvedSummaries: [],
        // Start przygotowuje pamięć automatycznie, bez ręcznego wyboru podsumowań.
        canStartWithoutContext: false,
        sessionQuota: freeQuota,
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
        canStartWithoutContext: false,
      },
    });
  });
});

describe("voice sessions in the start page state", () => {
  const voiceActive: SessionMetadata = {
    ...activeSession,
    id: "voice-session-1",
    modalityId: avatar.selected.modalityId,
    avatarId: avatar.selected.avatarId,
    status: "active",
    startedAt: "2026-06-07T09:58:00.000Z",
    expiresAt: "2026-06-07T10:08:00.000Z",
    endedAt: null,
    isTrial: false,
    trialClaimId: null,
    durationBucketSeconds: 600,
    mode: "voice",
  };

  it("marks the view with the voice mode only for voice sessions", () => {
    expect(toSessionView(activeSession, now)).not.toHaveProperty("mode");
    expect(toSessionView(voiceActive, now)).toMatchObject({ mode: "voice", status: "active" });
  });

  it("reconciles an active voice session with its observer before showing it, on both read paths", async () => {
    const interrupted = { ...voiceActive, status: "interrupted" as const, endedAt: now.toISOString() };
    const reconcileVoiceSession = vi.fn(() => Promise.resolve({ session: interrupted }));
    const repository = createRepository({
      getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(voiceActive))),
      listOwnedActiveSessionMetadata: vi.fn(() => Promise.resolve(ok([voiceActive]))),
      reconcileVoiceSession,
    });

    const explicit = await readSessionStartPageState(
      context,
      { avatar, resumeSessionId: voiceActive.id, now },
      repository,
    );

    expect(reconcileVoiceSession).toHaveBeenCalledWith(context, voiceActive, { now });
    expect(explicit).toMatchObject({
      ok: true,
      data: { kind: "interrupted", session: { id: voiceActive.id, status: "interrupted", mode: "voice" } },
    });

    reconcileVoiceSession.mockClear();
    const latest = await readSessionStartPageState(context, { avatar, now }, repository);

    expect(reconcileVoiceSession).toHaveBeenCalledTimes(1);
    expect(latest).toMatchObject({ ok: true, data: { kind: "interrupted" } });
  });

  it("never calls the observer for text sessions, ended voice sessions or without the hook", async () => {
    const reconcileVoiceSession = vi.fn(() => Promise.resolve({ session: voiceActive }));
    const ended = { ...voiceActive, status: "completed" as const, endedAt: now.toISOString() };

    for (const session of [activeSession, ended]) {
      const repository = createRepository({
        getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(session))),
        reconcileVoiceSession,
      });
      await readSessionStartPageState(context, { avatar, resumeSessionId: session.id, now }, repository);
    }
    expect(reconcileVoiceSession).not.toHaveBeenCalled();

    const withoutHook = createRepository({ getOwnedSessionMetadata: vi.fn(() => Promise.resolve(ok(voiceActive))) });
    await expect(
      readSessionStartPageState(context, { avatar, resumeSessionId: voiceActive.id, now }, withoutHook),
    ).resolves.toMatchObject({ ok: true, data: { kind: "active", session: { mode: "voice" } } });
  });
});
