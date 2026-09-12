import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMessageRecord, SessionMetadata } from "@/lib/session-data/types";
import type { VoiceObserverStub } from "@/lib/voice/coordinator";
import type { VoiceObserverSnapshot } from "@/lib/voice/observer-core";
import {
  closeVoiceSession,
  drainVoiceObserver,
  reconcileVoiceSession,
  resolveVoiceTerminalStatus,
  type VoiceReconcileDependencies,
} from "../voice-reconcile";

const context = { user: { id: "user-1" } } as SessionDataContext;
const now = new Date("2026-09-12T10:05:00.000Z");

const voiceSession: SessionMetadata = {
  id: "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-09-12T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-09-12T10:10:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: false,
  trialClaimId: null,
  durationBucketSeconds: 600,
  usesApprovedContext: true,
  usesAvatarMemory: true,
  mode: "voice",
  voiceConnectedAt: "2026-09-12T10:00:05.000Z",
  createdAt: "2026-09-12T10:00:00.000Z",
  updatedAt: "2026-09-12T10:00:00.000Z",
};

const snapshot: VoiceObserverSnapshot = {
  epoch: 2,
  live: true,
  closeReason: null,
  deadlineAtMs: Date.parse("2026-09-12T10:09:45.000Z"),
  armedAtMs: Date.parse("2026-09-12T10:00:05.000Z"),
  observing: true,
  pendingUtterances: 0,
};

function storedMessage(utteranceId: string, role: "user" | "assistant", content: string): SessionMessageRecord {
  return {
    id: `row-${utteranceId}`,
    sessionId: voiceSession.id,
    userId: "user-1",
    role,
    sequenceIndex: Number(utteranceId.slice(1)),
    content,
    createdAt: "2026-09-12T10:04:00.000Z",
  };
}

function createStub(drains: { ordinal: number; utteranceId: string; role: "user" | "assistant"; content: string }[][]) {
  let round = 0;
  const stub = {
    arm: vi.fn(),
    beat: vi.fn(() => Promise.resolve(snapshot)),
    drain: vi.fn(() => {
      const utterances = drains[round] ?? [];
      round += 1;
      return Promise.resolve({ ...snapshot, utterances });
    }),
    ack: vi.fn(() => Promise.resolve()),
    hangupNow: vi.fn(() => Promise.resolve({ ...snapshot, live: false, closeReason: "time_limit_reached" as const })),
    purge: vi.fn(() => Promise.resolve()),
    getState: vi.fn(() => Promise.resolve(snapshot)),
    alarm: vi.fn(() => Promise.resolve()),
  };
  return stub as unknown as VoiceObserverStub & typeof stub;
}

function createDependencies(
  stub: VoiceObserverStub | null,
  overrides: Partial<VoiceReconcileDependencies> = {},
): VoiceReconcileDependencies {
  return {
    getVoiceObserver: vi.fn(() => stub),
    appendVoiceSessionUtterances: vi.fn<VoiceReconcileDependencies["appendVoiceSessionUtterances"]>(
      (_context, _sessionId, utterances) =>
        Promise.resolve(
          ok({
            inserted: utterances.length,
            skipped: 0,
            messages: utterances.map((utterance) =>
              storedMessage(utterance.utteranceId, utterance.role, utterance.content),
            ),
          }),
        ),
    ),
    transitionSessionLifecycle: vi.fn<VoiceReconcileDependencies["transitionSessionLifecycle"]>((_context, input) =>
      Promise.resolve(ok({ ...voiceSession, status: input.nextStatus, endedAt: input.endedAt ?? null })),
    ),
    ...overrides,
  };
}

describe("drainVoiceObserver", () => {
  it("writes each batch through the RPC before acknowledging it and returns the stored rows", async () => {
    const stub = createStub([
      [
        { ordinal: 1, utteranceId: "u1", role: "user", content: "Cześć" },
        { ordinal: 2, utteranceId: "u2", role: "assistant", content: "Dzień dobry" },
      ],
    ]);
    const dependencies = createDependencies(stub);

    const outcome = await drainVoiceObserver(context, voiceSession.id, stub, dependencies);

    expect(dependencies.appendVoiceSessionUtterances).toHaveBeenCalledWith(context, voiceSession.id, [
      { utteranceId: "u1", role: "user", content: "Cześć" },
      { utteranceId: "u2", role: "assistant", content: "Dzień dobry" },
    ]);
    expect(stub.ack).toHaveBeenCalledWith([1, 2]);
    expect(outcome.drainFailed).toBe(false);
    expect(outcome.messages).toEqual([
      { id: "row-u1", role: "user", sequenceIndex: 1, content: "Cześć", createdAt: "2026-09-12T10:04:00.000Z" },
      {
        id: "row-u2",
        role: "assistant",
        sequenceIndex: 2,
        content: "Dzień dobry",
        createdAt: "2026-09-12T10:04:00.000Z",
      },
    ]);
    // Krótka partia (< 50) kończy zrzut bez kolejnej rundy.
    expect(stub.drain).toHaveBeenCalledTimes(1);
  });

  it("keeps the buffer when the write fails (no ack) so the next heartbeat retries", async () => {
    const stub = createStub([[{ ordinal: 1, utteranceId: "u1", role: "user", content: "Cześć" }]]);
    const dependencies = createDependencies(stub, {
      appendVoiceSessionUtterances: vi.fn(() => Promise.resolve(sessionDataError("write_failed"))),
    });

    const outcome = await drainVoiceObserver(context, voiceSession.id, stub, dependencies);

    expect(stub.ack).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ drainFailed: true, messages: [] });
  });

  it("drains full batches in rounds and stops after the first short one", async () => {
    const full = Array.from({ length: 50 }, (_, index) => ({
      ordinal: index + 1,
      utteranceId: `u${index + 1}`,
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `t${index + 1}`,
    }));
    const stub = createStub([full, [{ ordinal: 51, utteranceId: "u51", role: "user", content: "koniec" }]]);
    const dependencies = createDependencies(stub);

    const outcome = await drainVoiceObserver(context, voiceSession.id, stub, dependencies);

    expect(stub.drain).toHaveBeenCalledTimes(2);
    expect(dependencies.appendVoiceSessionUtterances).toHaveBeenCalledTimes(2);
    expect(outcome.messages).toHaveLength(51);
  });
});

describe("reconcileVoiceSession", () => {
  it("leaves text sessions and sessions without an observer untouched", async () => {
    const dependencies = createDependencies(null);
    const text = { ...voiceSession, mode: "text" as const };

    await expect(reconcileVoiceSession(context, text, { now }, dependencies)).resolves.toEqual({
      session: text,
      messages: [],
      snapshot: null,
    });
    expect(dependencies.getVoiceObserver).not.toHaveBeenCalled();
    await expect(reconcileVoiceSession(context, voiceSession, { now }, dependencies)).resolves.toMatchObject({
      session: voiceSession,
      snapshot: null,
    });
  });

  it("drains the buffer and moves the row to the terminal status the observer decided", async () => {
    for (const [closeReason, nextStatus] of [
      ["interrupted", "interrupted"],
      ["time_limit_reached", "expired"],
      ["voice_disabled", "completed"],
    ] as const) {
      const stub = createStub([[{ ordinal: 1, utteranceId: "u1", role: "user", content: "…" }]]);
      stub.drain.mockImplementation(() => Promise.resolve({ ...snapshot, live: false, closeReason, utterances: [] }));
      const dependencies = createDependencies(stub);

      const result = await reconcileVoiceSession(context, voiceSession, { now }, dependencies);

      expect(dependencies.transitionSessionLifecycle).toHaveBeenCalledWith(context, {
        sessionId: voiceSession.id,
        nextStatus,
        endedAt: now.toISOString(),
        durationBucketSeconds: 600,
      });
      expect(result.session.status).toBe(nextStatus);
      expect(result.snapshot?.closeReason).toBe(closeReason);
    }
  });

  it("keeps the row active for reasons the user can come back from, and never touches an ended row", async () => {
    for (const closeReason of [
      "heartbeat_lost",
      "safety_unavailable",
      "provider_closed",
      "reconnected",
      null,
    ] as const) {
      const stub = createStub([]);
      stub.drain.mockImplementation(() => Promise.resolve({ ...snapshot, live: false, closeReason, utterances: [] }));
      const dependencies = createDependencies(stub);

      const result = await reconcileVoiceSession(context, voiceSession, { now }, dependencies);

      expect(dependencies.transitionSessionLifecycle).not.toHaveBeenCalled();
      expect(result.session.status).toBe("active");
    }

    const stub = createStub([]);
    stub.drain.mockImplementation(() =>
      Promise.resolve({ ...snapshot, live: false, closeReason: "interrupted" as const, utterances: [] }),
    );
    const dependencies = createDependencies(stub);
    const completed = { ...voiceSession, status: "completed" as const, endedAt: "2026-09-12T10:04:00.000Z" };

    await expect(reconcileVoiceSession(context, completed, { now }, dependencies)).resolves.toMatchObject({
      session: completed,
    });
    expect(dependencies.transitionSessionLifecycle).not.toHaveBeenCalled();
  });

  it("hangs up and expires a session whose deadline passed on the database side", async () => {
    const stub = createStub([]);
    const dependencies = createDependencies(stub);
    const late = new Date("2026-09-12T10:11:00.000Z");

    const result = await reconcileVoiceSession(context, voiceSession, { now: late }, dependencies);

    expect(stub.hangupNow).toHaveBeenCalledWith("time_limit_reached");
    expect(dependencies.transitionSessionLifecycle).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ nextStatus: "expired", endedAt: late.toISOString() }),
    );
    expect(result.session.status).toBe("expired");
  });

  it("falls back to the database state when the observer is unreachable", async () => {
    const stub = createStub([]);
    stub.drain.mockImplementation(() => Promise.reject(new Error("durable object unreachable")));
    const dependencies = createDependencies(stub);

    await expect(reconcileVoiceSession(context, voiceSession, { now }, dependencies)).resolves.toEqual({
      session: voiceSession,
      messages: [],
      snapshot: null,
    });
    await expect(
      reconcileVoiceSession(
        context,
        voiceSession,
        { now },
        createDependencies(null, {
          getVoiceObserver: () => {
            throw new Error("no binding");
          },
        }),
      ),
    ).resolves.toMatchObject({ session: voiceSession, snapshot: null });
  });
});

describe("closeVoiceSession", () => {
  it("hangs up with our reason and drains the rest, purging instead after a deletion", async () => {
    const stub = createStub([[{ ordinal: 9, utteranceId: "u9", role: "assistant", content: "Do zobaczenia" }]]);
    const dependencies = createDependencies(stub);

    const outcome = await closeVoiceSession(context, voiceSession, "completed", dependencies);

    expect(stub.hangupNow).toHaveBeenCalledWith("completed");
    expect(stub.ack).toHaveBeenCalledWith([9]);
    expect(outcome?.messages).toHaveLength(1);
    expect(stub.purge).not.toHaveBeenCalled();

    const deleted = createStub([[{ ordinal: 1, utteranceId: "u1", role: "user", content: "x" }]]);
    const deletedDependencies = createDependencies(deleted);
    await expect(closeVoiceSession(context, voiceSession, "deleted", deletedDependencies)).resolves.toBeNull();
    expect(deleted.hangupNow).toHaveBeenCalledWith("deleted");
    expect(deleted.purge).toHaveBeenCalledTimes(1);
    expect(deletedDependencies.appendVoiceSessionUtterances).not.toHaveBeenCalled();
  });

  it("ignores text sessions and swallows observer failures", async () => {
    const dependencies = createDependencies(createStub([]));

    await expect(closeVoiceSession(context, { id: "x", mode: "text" }, "completed", dependencies)).resolves.toBeNull();
    await expect(
      closeVoiceSession(context, { id: "x", mode: undefined }, "completed", dependencies),
    ).resolves.toBeNull();
    expect(dependencies.getVoiceObserver).not.toHaveBeenCalled();

    const failing = createStub([]);
    failing.hangupNow.mockImplementation(() => Promise.reject(new Error("boom")));
    await expect(
      closeVoiceSession(context, voiceSession, "completed", createDependencies(failing)),
    ).resolves.toBeNull();
  });
});

describe("resolveVoiceTerminalStatus", () => {
  it("maps only the three terminal reasons", () => {
    expect(resolveVoiceTerminalStatus("interrupted")).toBe("interrupted");
    expect(resolveVoiceTerminalStatus("time_limit_reached")).toBe("expired");
    expect(resolveVoiceTerminalStatus("voice_disabled")).toBe("completed");
    for (const reason of [
      "completed",
      "heartbeat_lost",
      "safety_unavailable",
      "reconnected",
      "deleted",
      "provider_closed",
      null,
    ] as const) {
      expect(resolveVoiceTerminalStatus(reason)).toBeNull();
    }
  });
});
