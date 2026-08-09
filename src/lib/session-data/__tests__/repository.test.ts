import { describe, expect, it, vi } from "vitest";
import { mapSupabaseReadError, mapSupabaseWriteError } from "../errors";
import {
  canTransitionSessionLifecycle,
  getNextSessionSummaryRevision,
  listNewestApprovedSessionSummaryContexts,
  toApprovedSessionSummaryContexts,
  toDeletedSessionTombstone,
  toLatestSessionSummaryState,
} from "../repository";
import type { SessionDataContext, SessionMetadata, SessionSummaryRecord } from "../types";

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
  usesApprovedContext: true,
  createdAt: "2026-06-06T09:59:00.000Z",
  updatedAt: "2026-06-06T10:00:00.000Z",
};

const baseSummary: SessionSummaryRecord = {
  id: "summary-1",
  sessionId: "session-1",
  userId: "user-1",
  summaryText: "Uzytkownik chce spokojnie kontynuowac watek rozmowy.",
  status: "draft",
  isVisible: true,
  revision: 1,
  createdAt: "2026-06-06T10:10:00.000Z",
  updatedAt: "2026-06-06T10:10:00.000Z",
};

function rawSummary(summary: SessionSummaryRecord) {
  return {
    id: summary.id,
    session_id: summary.sessionId,
    user_id: summary.userId,
    summary_text: summary.summaryText,
    status: summary.status,
    is_visible: summary.isVisible,
    revision: summary.revision,
    created_at: summary.createdAt,
    updated_at: summary.updatedAt,
  };
}

function createApprovedContextQuery(rows: unknown[]) {
  const calls: [string, ...unknown[]][] = [];
  const query = {
    select: vi.fn((...args: unknown[]) => {
      calls.push(["select", ...args]);
      return query;
    }),
    eq: vi.fn((...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return query;
    }),
    neq: vi.fn((...args: unknown[]) => {
      calls.push(["neq", ...args]);
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      calls.push(["order", ...args]);
      return query;
    }),
    limit: vi.fn((...args: unknown[]) => {
      calls.push(["limit", ...args]);
      return Promise.resolve({
        data: rows,
        error: null,
      });
    }),
  };

  return {
    calls,
    context: {
      user: {
        id: "user-1",
      },
      supabase: {
        from: vi.fn((table: string) => {
          calls.push(["from", table]);
          return query;
        }),
      },
    } as unknown as SessionDataContext,
  };
}

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

  it("derives the next summary revision after generated previews and approved summaries", () => {
    expect(
      getNextSessionSummaryRevision([
        baseSummary,
        {
          ...baseSummary,
          id: "summary-2",
          status: "ready",
          revision: 2,
        },
      ]),
    ).toBe(3);
  });

  it("returns explicit latest summary states without exposing deleted or invisible summaries", () => {
    expect(toLatestSessionSummaryState([baseSummary])).toEqual({
      kind: "preview",
      summary: {
        id: "summary-1",
        sessionId: "session-1",
        summaryText: "Uzytkownik chce spokojnie kontynuowac watek rozmowy.",
        status: "draft",
        isVisible: true,
        revision: 1,
        createdAt: "2026-06-06T10:10:00.000Z",
        updatedAt: "2026-06-06T10:10:00.000Z",
      },
    });
    expect(
      toLatestSessionSummaryState([
        {
          ...baseSummary,
          id: "summary-2",
          status: "ready",
          revision: 2,
        },
      ]),
    ).toMatchObject({
      kind: "approved",
      summary: {
        id: "summary-2",
        status: "ready",
        revision: 2,
      },
    });
    expect(
      toLatestSessionSummaryState([
        {
          ...baseSummary,
          id: "deleted-summary",
          status: "deleted",
          isVisible: false,
          revision: 3,
        },
        {
          ...baseSummary,
          id: "invisible-summary",
          isVisible: false,
          revision: 2,
        },
      ]),
    ).toEqual({
      kind: "none",
    });
  });

  it("returns at most three newest approved ready visible summary contexts", () => {
    const contexts = toApprovedSessionSummaryContexts([
      {
        ...baseSummary,
        id: "draft-summary",
        sessionId: "draft-session",
        status: "draft",
      },
      {
        ...baseSummary,
        id: "stale-summary",
        sessionId: "stale-session",
        status: "stale",
      },
      {
        ...baseSummary,
        id: "deleted-summary",
        sessionId: "deleted-session",
        status: "deleted",
        isVisible: false,
      },
      {
        ...baseSummary,
        id: "old-approved",
        sessionId: "session-a",
        status: "ready",
        revision: 1,
        updatedAt: "2026-06-06T09:00:00.000Z",
      },
      {
        ...baseSummary,
        id: "new-approved",
        sessionId: "session-a",
        status: "ready",
        revision: 2,
        updatedAt: "2026-06-06T11:00:00.000Z",
      },
      {
        ...baseSummary,
        id: "approved-b",
        sessionId: "session-b",
        status: "ready",
        updatedAt: "2026-06-06T10:30:00.000Z",
      },
      {
        ...baseSummary,
        id: "approved-c",
        sessionId: "session-c",
        status: "ready",
        updatedAt: "2026-06-06T10:20:00.000Z",
      },
      {
        ...baseSummary,
        id: "approved-d",
        sessionId: "session-d",
        status: "ready",
        updatedAt: "2026-06-06T10:10:00.000Z",
      },
    ]);

    expect(contexts.map((summary) => summary.id)).toEqual(["new-approved", "approved-b", "approved-c"]);
    expect(contexts).toHaveLength(3);
    expect(contexts.every((summary) => typeof summary.summaryText === "string")).toBe(true);
  });

  it("queries approved summary context through owner, ready, visible, and non-deleted session filters", async () => {
    const { calls, context } = createApprovedContextQuery([
      rawSummary({
        ...baseSummary,
        id: "approved-summary",
        status: "ready",
      }),
    ]);

    await expect(listNewestApprovedSessionSummaryContexts(context)).resolves.toMatchObject({
      ok: true,
      data: [
        {
          id: "approved-summary",
          sessionId: "session-1",
          summaryText: "Uzytkownik chce spokojnie kontynuowac watek rozmowy.",
          revision: 1,
        },
      ],
    });
    expect(calls).toContainEqual(["from", "session_summaries"]);
    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["eq", "status", "ready"]);
    expect(calls).toContainEqual(["eq", "is_visible", true]);
    expect(calls).toContainEqual(["neq", "therapy_sessions.status", "deleted"]);
  });
});
