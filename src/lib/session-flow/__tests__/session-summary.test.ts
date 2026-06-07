import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type {
  OwnedSessionHistoryDetail,
  SessionDataContext,
  SessionMessageRecord,
  SessionMetadata,
} from "@/lib/session-data/types";
import { SessionSummaryError } from "@/lib/session-summary/errors";
import {
  buildOwnedSessionSummaryGenerationInput,
  generateOwnedSessionSummary,
  type SessionSummarySourceRepository,
} from "../session-summary";

const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

const baseSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "completed",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: "2026-06-07T10:12:00.000Z",
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: true,
  trialClaimId: "claim-1",
  durationBucketSeconds: 900,
  createdAt: "2026-06-07T09:59:00.000Z",
  updatedAt: "2026-06-07T10:12:00.000Z",
};

const messages: SessionMessageRecord[] = [
  {
    id: "message-2",
    sessionId: "session-1",
    userId: "user-1",
    role: "assistant",
    sequenceIndex: 2,
    content: "Mozemy zobaczyc, ktory watek wraca najmocniej.",
    createdAt: "2026-06-07T10:02:00.000Z",
  },
  {
    id: "message-boundary",
    sessionId: "session-1",
    userId: "user-1",
    role: "system_boundary",
    sequenceIndex: 1,
    content: "System boundary content must not enter summary provider input.",
    createdAt: "2026-06-07T10:01:30.000Z",
  },
  {
    id: "message-1",
    sessionId: "session-1",
    userId: "user-1",
    role: "user",
    sequenceIndex: 0,
    content: "W pracy ciagle wraca napiecie przed trudna rozmowa.",
    createdAt: "2026-06-07T10:01:00.000Z",
  },
];

function createRepository(
  detail: OwnedSessionHistoryDetail = { session: baseSession, messages },
): SessionSummarySourceRepository {
  return {
    getOwnedSessionHistoryDetail: vi.fn(() => Promise.resolve(ok(detail))),
  };
}

describe("buildOwnedSessionSummaryGenerationInput", () => {
  it("returns stable missing auth and not found failures before provider work", async () => {
    await expect(
      buildOwnedSessionSummaryGenerationInput(null, { sessionId: "session-1" }, createRepository()),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "missing_auth",
      },
    });

    await expect(
      buildOwnedSessionSummaryGenerationInput(context, { sessionId: " " }, createRepository()),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "session_not_found",
      },
    });
  });

  it("maps repository missing sessions and read failures to stable codes", async () => {
    await expect(
      buildOwnedSessionSummaryGenerationInput(
        context,
        { sessionId: "missing" },
        {
          getOwnedSessionHistoryDetail: vi.fn(() => Promise.resolve(sessionDataError("session_not_found"))),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "session_not_found",
      },
    });

    await expect(
      buildOwnedSessionSummaryGenerationInput(
        context,
        { sessionId: "session-1" },
        {
          getOwnedSessionHistoryDetail: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
        },
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "read_failed",
      },
    });
  });

  it("rejects active or empty sessions as not summarizable", async () => {
    await expect(
      buildOwnedSessionSummaryGenerationInput(
        context,
        { sessionId: "session-1" },
        createRepository({
          session: {
            ...baseSession,
            status: "active",
          },
          messages,
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "session_not_summarizable",
      },
    });

    await expect(
      buildOwnedSessionSummaryGenerationInput(
        context,
        { sessionId: "session-1" },
        createRepository({
          session: baseSession,
          messages: [],
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "session_not_summarizable",
      },
    });
  });

  it("builds ordered, bounded provider input from owned non-deleted history detail", async () => {
    const result = await buildOwnedSessionSummaryGenerationInput(
      context,
      { sessionId: "session-1" },
      createRepository(),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.messages).toEqual([
        {
          role: "user",
          content: "W pracy ciagle wraca napiecie przed trudna rozmowa.",
          sequenceIndex: 0,
        },
        {
          role: "assistant",
          content: "Mozemy zobaczyc, ktory watek wraca najmocniej.",
          sequenceIndex: 2,
        },
      ]);
      expect(JSON.stringify(result.data.messages)).not.toContain("System boundary");
      expect(result.data.modality).toMatchObject({
        modalityName: "Podejscie poznawczo-behawioralne",
        avatarName: "Marek, praktyczny przewodnik",
      });
      expect(result.data.locale).toBe("pl");
    }
  });

  it("limits provider source input to the newest forty user and assistant messages", async () => {
    const longMessages = Array.from({ length: 45 }, (_, index) => ({
      id: `message-${index}`,
      sessionId: "session-1",
      userId: "user-1",
      role: index % 2 === 0 ? "user" : "assistant",
      sequenceIndex: index,
      content: `wiadomosc-${index}-`.repeat(200),
      createdAt: "2026-06-07T10:01:00.000Z",
    })) satisfies SessionMessageRecord[];
    const result = await buildOwnedSessionSummaryGenerationInput(
      context,
      { sessionId: "session-1" },
      createRepository({
        session: baseSession,
        messages: longMessages,
      }),
    );

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.data.messages).toHaveLength(40);
      expect(result.data.messages[0]?.content).toContain("wiadomosc-5");
      expect(result.data.messages.every((message) => message.content.length <= 1_200)).toBe(true);
    }
  });
});

describe("generateOwnedSessionSummary", () => {
  it("uses a mocked provider and returns stable failure codes without raw provider errors", async () => {
    const provider = {
      generateSessionSummary: vi.fn(() => Promise.reject(new SessionSummaryError("provider_unavailable"))),
    };

    await expect(
      generateOwnedSessionSummary(context, { sessionId: "session-1" }, provider, createRepository()),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "provider_failed",
      },
    });
    expect(provider.generateSessionSummary).toHaveBeenCalledOnce();
  });

  it("returns only generated summary text and safe provider metadata on success", async () => {
    const provider = {
      generateSessionSummary: vi.fn(() =>
        Promise.resolve({
          summaryText: "Uzytkownik chce kontynuowac watek napiecia w pracy.",
          providerMetadata: {
            provider: "openrouter" as const,
            model: "openai/gpt-4o-mini",
          },
        }),
      ),
    };

    await expect(
      generateOwnedSessionSummary(context, { sessionId: "session-1" }, provider, createRepository()),
    ).resolves.toEqual({
      ok: true,
      data: {
        summaryText: "Uzytkownik chce kontynuowac watek napiecia w pracy.",
        providerMetadata: {
          provider: "openrouter",
          model: "openai/gpt-4o-mini",
        },
      },
    });
  });
});
