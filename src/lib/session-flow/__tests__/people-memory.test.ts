import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type {
  PeopleMemoryWork,
  getOwnedPeopleMemoryWork,
  saveOwnedPeopleMemoryWork,
} from "@/lib/session-data/people-memory";
import type { SessionDataContext } from "@/lib/session-data/types";
import { SessionSummaryError } from "@/lib/session-summary/errors";
import type { GeneratePeopleMemoryInput, PeopleMemoryResponse } from "@/lib/session-summary/people-memory-types";

vi.mock("@/lib/session-summary/people-memory-provider", () => ({ generatePeopleMemory: vi.fn() }));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled: () => true }));
import { buildPeopleMemoryBatch, prepareOwnedPeopleMemory, toPeopleMemoryChangeSet } from "../people-memory";

const context = { user: { id: "owner" } } as SessionDataContext;
const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const work: PeopleMemoryWork = {
  revision: "rev-1",
  enabled: true,
  persons: [
    {
      id: "person-marta",
      name: "Marta",
      nameLocked: false,
      relation: "koleżanka z pracy",
      relationLocked: false,
      userNote: "",
      facts: [
        { id: "fact-a", kind: "account", text: "Skomentowała pomysł.", userEdited: false },
        { id: "fact-b", kind: "feeling", text: "Złość.", userEdited: true },
      ],
    },
  ],
  forgottenPeople: [{ name: "sylwia", relation: null }],
  messages: [
    { sessionId: "session-1", role: "user", content: "Marta znowu.", sequenceIndex: 0, characterOffset: 12 },
    { sessionId: "session-1", role: "assistant", content: "Co poczułeś?", sequenceIndex: 1, characterOffset: 12 },
    { sessionId: "session-2", role: "user", content: "Kuzynka Marta pomogła.", sequenceIndex: 0, characterOffset: 22 },
  ],
};
const readyWork: PeopleMemoryWork = { ...work, messages: [] };
const response: PeopleMemoryResponse = {
  changes: {
    newPersons: [
      {
        name: "Marta",
        relation: "kuzynka",
        facts: [{ kind: "who", text: "Pomogła po rozmowie.", conversationIndex: 2 }],
      },
      { name: "Marek", relation: null, facts: [{ kind: "who", text: "Awatar.", conversationIndex: 1 }] },
      { name: "Sylwia", relation: null, facts: [{ kind: "who", text: "Zapomniana.", conversationIndex: 1 }] },
    ],
    updates: [
      {
        personRef: 1,
        relation: "koleżanka z zespołu",
        addFacts: [{ kind: "account", text: "Znowu skomentowała.", conversationIndex: 1 }],
        replaceFacts: [
          { factRef: 1, kind: "account", text: "Skomentowała pomysł przy zespole.", conversationIndex: 1 },
        ],
        removeFactRefs: [2],
        mentionedInConversations: [2, 1],
      },
    ],
    incomplete: false,
  },
  providerMetadata: { provider: "openrouter", model: "test", usage: { promptTokens: 100, completionTokens: 40 } },
};

const dependencies = () => ({
  getOwnedPeopleMemoryWork: vi
    .fn<typeof getOwnedPeopleMemoryWork>()
    .mockResolvedValueOnce(ok(work))
    .mockResolvedValue(ok(readyWork)),
  saveOwnedPeopleMemoryWork: vi.fn<typeof saveOwnedPeopleMemoryWork>().mockResolvedValue(ok(true)),
  generatePeopleMemory: vi
    .fn<(input: GeneratePeopleMemoryInput) => Promise<PeopleMemoryResponse>>()
    .mockResolvedValue(response),
  isPeopleMemoryEnabled: vi.fn(() => true),
});

describe("buildPeopleMemoryBatch", () => {
  it("assigns local refs and conversation indexes so no database id reaches the prompt", () => {
    const batch = buildPeopleMemoryBatch(work);
    expect(batch.messages.map((message) => message.conversationIndex)).toEqual([1, 1, 2]);
    expect(batch.cursors).toEqual([
      { sessionId: "session-1", sequenceIndex: 1, characterOffset: 12 },
      { sessionId: "session-2", sequenceIndex: 0, characterOffset: 22 },
    ]);
    expect(batch.persons).toEqual([
      expect.objectContaining({
        ref: 1,
        name: "Marta",
        facts: [expect.objectContaining({ ref: 1 }), expect.objectContaining({ ref: 2, userEdited: true })],
      }),
    ]);
    expect(JSON.stringify(batch.persons)).not.toContain("person-marta");
    expect(JSON.stringify(batch.messages)).not.toContain("session-");
    expect(batch.refIndex).toEqual({
      personRefs: new Set([1]),
      factRefsByPerson: new Map([[1, new Set([1, 2])]]),
      conversationCount: 2,
    });
  });
});

describe("toPeopleMemoryChangeSet", () => {
  it("maps refs to ids and conversations to sessions, and enforces exclusions and the avatar name locally", () => {
    const batch = buildPeopleMemoryBatch(work);
    const changes = toPeopleMemoryChangeSet(response.changes, batch, {
      avatarFirstName: "Marek",
      forgottenPeople: work.forgottenPeople,
    });
    expect(changes).toEqual({
      newPersons: [
        {
          name: "Marta",
          relation: "kuzynka",
          relationSourceSessionId: "session-2",
          facts: [{ kind: "who", text: "Pomogła po rozmowie.", sourceSessionId: "session-2" }],
        },
      ],
      updates: [
        {
          personId: "person-marta",
          relation: "koleżanka z zespołu",
          relationSourceSessionId: "session-2",
          addFacts: [{ kind: "account", text: "Znowu skomentowała.", sourceSessionId: "session-1" }],
          replaceFacts: [
            {
              factId: "fact-a",
              kind: "account",
              text: "Skomentowała pomysł przy zespole.",
              sourceSessionId: "session-1",
            },
          ],
          removeFactIds: ["fact-b"],
          mentionedSessionIds: ["session-1", "session-2"],
        },
      ],
    });
  });

  it("keeps a forgotten name with a clearly different relation and drops it when the relation is unclear", () => {
    const batch = buildPeopleMemoryBatch(work);
    const forgottenPeople = [{ name: "marta", relation: "koleżanka z pracy" }];
    const changes = toPeopleMemoryChangeSet(
      {
        newPersons: [
          { name: "Marta", relation: "kuzynka", facts: [{ kind: "who", text: "x", conversationIndex: 1 }] },
          { name: "marta", relation: null, facts: [{ kind: "who", text: "y", conversationIndex: 1 }] },
          { name: "Marta", relation: "Koleżanka z pracy", facts: [{ kind: "who", text: "z", conversationIndex: 1 }] },
        ],
        updates: [],
        incomplete: false,
      },
      batch,
      { avatarFirstName: "Marek", forgottenPeople },
    );
    expect(changes.newPersons.map((person) => person.relation)).toEqual(["kuzynka"]);
  });
});

describe("prepareOwnedPeopleMemory", () => {
  it("skips without any read or generation while the flag or the preference is off", async () => {
    const deps = dependencies();
    deps.isPeopleMemoryEnabled.mockReturnValue(false);
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toEqual({
      ok: true,
      ready: true,
      updated: false,
      skipped: "mode_off",
    });
    expect(deps.getOwnedPeopleMemoryWork).not.toHaveBeenCalled();
    const preferenceOff = dependencies();
    preferenceOff.getOwnedPeopleMemoryWork.mockReset().mockResolvedValue(ok({ ...readyWork, enabled: false }));
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, preferenceOff)).toEqual({
      ok: true,
      ready: true,
      updated: false,
      skipped: "preference_off",
    });
    expect(preferenceOff.generatePeopleMemory).not.toHaveBeenCalled();
  });

  it("generates once per batch, saves the mapped change set with all cursors, and re-checks readiness", async () => {
    const deps = dependencies();
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toEqual({
      ok: true,
      ready: true,
      updated: true,
      usage: { inputUnits: 100, outputUnits: 40 },
    });
    expect(deps.generatePeopleMemory).toHaveBeenCalledTimes(1);
    const input = deps.generatePeopleMemory.mock.calls[0][0];
    expect(input).toMatchObject({ locale: "pl", avatarFirstName: "Marek", forgottenPeople: work.forgottenPeople });
    expect(JSON.stringify(input)).not.toContain("person-marta");
    const [savedContext, savedAvatar, saved] = deps.saveOwnedPeopleMemoryWork.mock.calls[0];
    expect(savedContext).toBe(context);
    expect(savedAvatar).toBe("cbt-guide");
    expect(saved.revision).toBe("rev-1");
    expect(saved.cursors).toEqual([
      { sessionId: "session-1", sequenceIndex: 1, characterOffset: 12 },
      { sessionId: "session-2", sequenceIndex: 0, characterOffset: 22 },
    ]);
    expect(saved.changes.updates.map((update) => update.personId)).toEqual(["person-marta"]);
    expect(deps.getOwnedPeopleMemoryWork).toHaveBeenCalledTimes(2);
  });

  it("does not call AI again when the history is already covered", async () => {
    const deps = dependencies();
    deps.getOwnedPeopleMemoryWork.mockReset().mockResolvedValue(ok(readyWork));
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toEqual({
      ok: true,
      ready: true,
      updated: false,
    });
    expect(deps.generatePeopleMemory).not.toHaveBeenCalled();
  });

  it("splits the batch in half without moving cursors when the response is incomplete, then accepts a partial result", async () => {
    const deps = dependencies();
    deps.getOwnedPeopleMemoryWork.mockReset().mockResolvedValue(ok(work));
    deps.generatePeopleMemory.mockResolvedValue({ ...response, changes: { ...response.changes, incomplete: true } });
    const result = await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps);
    expect(deps.getOwnedPeopleMemoryWork.mock.calls.map(([, , options]) => options?.maxChars)).toEqual([
      16000, 8000, 4000, 16000,
    ]);
    expect(deps.generatePeopleMemory).toHaveBeenCalledTimes(3);
    expect(deps.saveOwnedPeopleMemoryWork).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      updated: true,
      partial: true,
      usage: { inputUnits: 300, outputUnits: 120 },
    });
  });

  it("saves the cursors even when the model found nothing relevant", async () => {
    const deps = dependencies();
    deps.generatePeopleMemory.mockResolvedValue({
      ...response,
      changes: { newPersons: [], updates: [], incomplete: false },
    });
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toMatchObject({
      ok: true,
      updated: true,
    });
    expect(deps.saveOwnedPeopleMemoryWork.mock.calls[0][2].changes).toEqual({ newPersons: [], updates: [] });
  });

  it("treats a lost save race as more work without re-reading and keeps failures retryable", async () => {
    const deps = dependencies();
    deps.saveOwnedPeopleMemoryWork.mockResolvedValue(ok(false));
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toEqual({
      ok: true,
      ready: false,
      updated: false,
      usage: { inputUnits: 100, outputUnits: 40 },
    });
    expect(deps.getOwnedPeopleMemoryWork).toHaveBeenCalledTimes(1);

    const failing = dependencies();
    failing.generatePeopleMemory.mockRejectedValue(new SessionSummaryError("provider_timeout"));
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, failing)).toEqual({
      ok: false,
      providerFailure: "provider_timeout",
    });
    expect(failing.saveOwnedPeopleMemoryWork).not.toHaveBeenCalled();

    const unreadable = dependencies();
    unreadable.getOwnedPeopleMemoryWork.mockReset().mockResolvedValue(sessionDataError("read_failed"));
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, unreadable)).toEqual({ ok: false });
  });
});
