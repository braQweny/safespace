import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type {
  DifficultyMemoryEntryRecord,
  PeopleMemoryWork,
  getOwnedPeopleMemoryWork,
  saveOwnedPeopleMemoryWork,
} from "@/lib/session-data/people-memory";
import type { SessionDataContext } from "@/lib/session-data/types";
import { SessionSummaryError } from "@/lib/session-summary/errors";
import type { GeneratePeopleMemoryInput, PeopleMemoryResponse } from "@/lib/session-summary/people-memory-types";

vi.mock("@/lib/session-summary/people-memory-provider", () => ({ generatePeopleMemory: vi.fn() }));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled: () => true }));
vi.mock("@/lib/session-flow/topic-map-mode", () => ({ isTopicMapEnabled: () => true }));
import {
  buildPeopleMemoryBatch,
  prepareOwnedPeopleMemory,
  selectIndexedEntries,
  toPeopleMemoryChangeSet,
} from "../people-memory";

const context = { user: { id: "owner" } } as SessionDataContext;
const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const entry = (
  id: string,
  kind: DifficultyMemoryEntryRecord["kind"],
  overrides: Partial<DifficultyMemoryEntryRecord> = {},
): DifficultyMemoryEntryRecord => ({
  id,
  kind,
  text: `${kind} note`,
  effect: null,
  personId: null,
  parentEntryId: null,
  userEdited: false,
  conversationAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});
const work: PeopleMemoryWork = {
  revision: "rev-1",
  enabled: true,
  topicsEnabled: true,
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
  difficulties: [
    {
      id: "difficulty-refusing",
      label: "Trudno mi odmawiać",
      labelLocked: false,
      archived: false,
      aliases: ["zawsze się zgadzam"],
      persons: [
        { personId: "person-marta", state: "confirmed", userDecided: false },
        { personId: "person-unknown", state: "confirmed", userDecided: false },
      ],
      entries: [
        entry("entry-how", "how", { personId: "person-marta" }),
        entry("entry-suggested", "suggested", { personId: "person-marta" }),
        entry("entry-outcome", "outcome", { parentEntryId: "entry-suggested", effect: "better" }),
      ],
    },
  ],
  messages: [
    { sessionId: "session-1", role: "user", content: "Marta znowu.", sequenceIndex: 0, characterOffset: 12 },
    { sessionId: "session-1", role: "assistant", content: "Co poczułeś?", sequenceIndex: 1, characterOffset: 12 },
    { sessionId: "session-2", role: "user", content: "Kuzynka Marta pomogła.", sequenceIndex: 0, characterOffset: 22 },
  ],
};
const readyWork: PeopleMemoryWork = { ...work, messages: [] };
const noDifficultyChanges = { newDifficulties: [], difficultyUpdates: [] };
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
      { name: "Tata", relation: "ojciec", facts: [{ kind: "who", text: "Ojciec.", conversationIndex: 2 }] },
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
    newDifficulties: [
      {
        label: "Odkładanie zadań",
        aliases: ["prokrastynacja"],
        // Pozycja 3 to Tata (po odrzuceniu awatara i zapomnianej zostaje pozycja 1).
        persons: [
          { personRef: null, newPersonPosition: 3, uncertain: true },
          { personRef: null, newPersonPosition: 1, uncertain: false },
          { personRef: 9, newPersonPosition: null, uncertain: false },
        ],
        entries: [
          {
            kind: "suggested",
            text: "Wybrać pierwszy mały krok.",
            effect: null,
            personRef: null,
            newPersonPosition: null,
            parentRef: null,
            parentPosition: null,
            conversationIndex: 1,
          },
          {
            kind: "how",
            text: "Z osobą spoza partii.",
            effect: null,
            personRef: 9,
            newPersonPosition: null,
            parentRef: null,
            parentPosition: null,
            conversationIndex: 1,
          },
          {
            kind: "agreed",
            text: "Spróbuję od poniedziałku.",
            effect: null,
            personRef: null,
            newPersonPosition: 3,
            parentRef: null,
            parentPosition: 0,
            conversationIndex: 2,
          },
        ],
      },
    ],
    difficultyUpdates: [
      {
        difficultyRef: 1,
        addAliases: ["brak asertywności"],
        addPersons: [{ personRef: 1, newPersonPosition: null, uncertain: false }],
        addEntries: [
          {
            kind: "outcome",
            text: "Pomogło przy Marcie.",
            effect: "better",
            personRef: 1,
            newPersonPosition: null,
            parentRef: 2,
            parentPosition: null,
            conversationIndex: 1,
          },
          {
            kind: "update",
            text: "Częściej odmawiam.",
            effect: "better",
            personRef: null,
            newPersonPosition: null,
            parentRef: null,
            parentPosition: null,
            conversationIndex: 7,
          },
        ],
        replaceEntries: [{ entryRef: 1, kind: "how", text: "Doprecyzowanie.", effect: null, conversationIndex: 2 }],
        removeEntryRefs: [3],
        mentionedInConversations: [2],
      },
      {
        difficultyRef: 5,
        addAliases: [],
        addPersons: [],
        addEntries: [],
        replaceEntries: [],
        removeEntryRefs: [],
        mentionedInConversations: [1],
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
  isTopicMapEnabled: vi.fn(() => true),
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
      difficultyRefs: new Set([1]),
      entryKindByRef: new Map([
        [
          1,
          new Map([
            [1, "how"],
            [2, "suggested"],
            [3, "outcome"],
          ]),
        ],
      ]),
      conversationCount: 2,
    });
  });

  it("indexes difficulties with person refs, parent refs and no ids, skipping persons outside the index", () => {
    const [difficulty] = buildPeopleMemoryBatch(work).difficulties;
    expect(difficulty).toEqual({
      ref: 1,
      label: "Trudno mi odmawiać",
      labelLocked: false,
      archived: false,
      aliases: ["zawsze się zgadzam"],
      persons: [{ personRef: 1, state: "confirmed" }],
      entries: [
        { ref: 1, kind: "how", text: "how note", effect: null, personRef: 1, parentRef: null, userEdited: false },
        {
          ref: 2,
          kind: "suggested",
          text: "suggested note",
          effect: null,
          personRef: 1,
          parentRef: null,
          userEdited: false,
        },
        {
          ref: 3,
          kind: "outcome",
          text: "outcome note",
          effect: "better",
          personRef: null,
          parentRef: 2,
          userEdited: false,
        },
      ],
    });
    expect(JSON.stringify(difficulty)).not.toContain("difficulty-refusing");
    expect(JSON.stringify(difficulty)).not.toContain("entry-");
  });
});

describe("selectIndexedEntries", () => {
  it("keeps every suggestion and agreement with its latest outcome, and windows the rest with refs only for shown entries", () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => entry(`update-${i}`, "update")),
      ...Array.from({ length: 4 }, (_, i) => entry(`how-${i}`, "how")),
      ...Array.from({ length: 3 }, (_, i) => entry(`coping-${i}`, "coping")),
      entry("s1", "suggested"),
      entry("o1", "outcome", { parentEntryId: "s1" }),
      entry("o2", "outcome", { parentEntryId: "s1" }),
      entry("a1", "agreed", { parentEntryId: "s1" }),
      ...Array.from({ length: 3 }, (_, i) => entry(`orphan-${i}`, "outcome")),
    ];
    const shown = selectIndexedEntries(entries).map((item) => item.id);
    expect(shown).toEqual([
      "update-2",
      "update-3",
      "update-4",
      "how-2",
      "how-3",
      "coping-1",
      "coping-2",
      "s1",
      "o2",
      "a1",
      "orphan-1",
      "orphan-2",
    ]);
    const batch = buildPeopleMemoryBatch({
      ...work,
      difficulties: [{ ...work.difficulties[0], entries }],
    });
    expect(batch.difficulties[0].entries.map((item) => item.ref)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(batch.entryIdByRef.get(1)?.get(8)).toBe("s1");
    expect(batch.difficulties[0].entries[8]).toMatchObject({ kind: "outcome", parentRef: 8 });
  });

  it("truncates index texts by Unicode code points", () => {
    const batch = buildPeopleMemoryBatch({
      ...work,
      difficulties: [{ ...work.difficulties[0], entries: [entry("long", "how", { text: "🙂".repeat(300) })] }],
    });
    expect(Array.from(batch.difficulties[0].entries[0].text)).toHaveLength(120);
  });
});

describe("toPeopleMemoryChangeSet", () => {
  it("maps refs to ids and conversations to sessions, and enforces exclusions and the avatar name locally", () => {
    const batch = buildPeopleMemoryBatch(work);
    const changes = toPeopleMemoryChangeSet(response.changes, batch, {
      avatarFirstName: "Marek",
      forgottenPeople: work.forgottenPeople,
    });
    expect(changes.newPersons).toEqual([
      {
        name: "Marta",
        relation: "kuzynka",
        relationSourceSessionId: "session-2",
        facts: [{ kind: "who", text: "Pomogła po rozmowie.", sourceSessionId: "session-2" }],
      },
      {
        name: "Tata",
        relation: "ojciec",
        relationSourceSessionId: "session-2",
        facts: [{ kind: "who", text: "Ojciec.", sourceSessionId: "session-2" }],
      },
    ]);
    expect(changes.updates).toEqual([
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
    ]);
  });

  it("maps difficulty refs, rewrites new-person positions after exclusions and drops what it cannot resolve", () => {
    const batch = buildPeopleMemoryBatch(work);
    const changes = toPeopleMemoryChangeSet(response.changes, batch, {
      avatarFirstName: "Marek",
      forgottenPeople: work.forgottenPeople,
    });
    expect(changes.newDifficulties).toEqual([
      {
        label: "Odkładanie zadań",
        addAliases: [{ text: "prokrastynacja", sourceSessionId: "session-1" }],
        // Tata przesunął się z pozycji 3 na 1; pozycja 1 (awatar) i ref 9 odpadły.
        addPersons: [{ personId: null, newPersonPosition: 1, uncertain: true }],
        addEntries: [
          {
            kind: "suggested",
            text: "Wybrać pierwszy mały krok.",
            effect: null,
            personId: null,
            newPersonPosition: null,
            parentEntryId: null,
            parentPosition: null,
            sourceSessionId: "session-1",
          },
          {
            kind: "agreed",
            text: "Spróbuję od poniedziałku.",
            effect: null,
            personId: null,
            newPersonPosition: 1,
            parentEntryId: null,
            parentPosition: 0,
            sourceSessionId: "session-2",
          },
        ],
        replaceEntries: [],
        removeEntryIds: [],
        mentionedSessionIds: ["session-1", "session-2"],
      },
    ]);
    expect(changes.difficultyUpdates).toEqual([
      {
        difficultyId: "difficulty-refusing",
        addAliases: [{ text: "brak asertywności", sourceSessionId: "session-1" }],
        addPersons: [{ personId: "person-marta", newPersonPosition: null, uncertain: false }],
        addEntries: [
          {
            kind: "outcome",
            text: "Pomogło przy Marcie.",
            effect: "better",
            personId: "person-marta",
            newPersonPosition: null,
            parentEntryId: "entry-suggested",
            parentPosition: null,
            sourceSessionId: "session-1",
          },
        ],
        replaceEntries: [
          { entryId: "entry-how", kind: "how", text: "Doprecyzowanie.", effect: null, sourceSessionId: "session-2" },
        ],
        removeEntryIds: ["entry-outcome"],
        mentionedSessionIds: ["session-1", "session-2"],
      },
    ]);
    expect(JSON.stringify(changes)).not.toContain("difficultyRef");
  });

  it("drops people changes when cards are inactive and difficulty changes when the map is inactive", () => {
    const batch = buildPeopleMemoryBatch(work);
    const options = { avatarFirstName: "Marek", forgottenPeople: work.forgottenPeople };
    const noPeople = toPeopleMemoryChangeSet(response.changes, batch, { ...options, peopleActive: false });
    expect(noPeople.newPersons).toEqual([]);
    expect(noPeople.updates).toEqual([]);
    // Bez osób nowa trudność traci powiązanie z Tatą i wpis przy nim.
    expect(noPeople.newDifficulties[0].addPersons).toEqual([]);
    expect(noPeople.newDifficulties[0].addEntries.map((item) => item.kind)).toEqual(["suggested"]);
    const noTopics = toPeopleMemoryChangeSet(response.changes, batch, { ...options, topicsActive: false });
    expect(noTopics.newDifficulties).toEqual([]);
    expect(noTopics.difficultyUpdates).toEqual([]);
    expect(noTopics.newPersons).toHaveLength(2);
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
        ...noDifficultyChanges,
        incomplete: false,
      },
      batch,
      { avatarFirstName: "Marek", forgottenPeople },
    );
    expect(changes.newPersons.map((person) => person.relation)).toEqual(["kuzynka"]);
  });
});

describe("prepareOwnedPeopleMemory", () => {
  it("skips without any read or generation while both flags or both preferences are off", async () => {
    const deps = dependencies();
    deps.isPeopleMemoryEnabled.mockReturnValue(false);
    deps.isTopicMapEnabled.mockReturnValue(false);
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toEqual({
      ok: true,
      ready: true,
      updated: false,
      skipped: "mode_off",
    });
    expect(deps.getOwnedPeopleMemoryWork).not.toHaveBeenCalled();
    const preferenceOff = dependencies();
    preferenceOff.getOwnedPeopleMemoryWork
      .mockReset()
      .mockResolvedValue(ok({ ...readyWork, enabled: false, topicsEnabled: false }));
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
    expect(input).toMatchObject({
      locale: "pl",
      avatarFirstName: "Marek",
      forgottenPeople: work.forgottenPeople,
      peopleEnabled: true,
      topicsEnabled: true,
    });
    expect(input.difficulties).toHaveLength(1);
    expect(JSON.stringify(input)).not.toContain("person-marta");
    expect(JSON.stringify(input)).not.toContain("difficulty-refusing");
    const [savedContext, savedAvatar, saved] = deps.saveOwnedPeopleMemoryWork.mock.calls[0];
    expect(savedContext).toBe(context);
    expect(savedAvatar).toBe("cbt-guide");
    expect(saved.revision).toBe("rev-1");
    expect(saved.cursors).toEqual([
      { sessionId: "session-1", sequenceIndex: 1, characterOffset: 12 },
      { sessionId: "session-2", sequenceIndex: 0, characterOffset: 22 },
    ]);
    expect(saved.changes.updates.map((update) => update.personId)).toEqual(["person-marta"]);
    expect(saved.changes.difficultyUpdates.map((update) => update.difficultyId)).toEqual(["difficulty-refusing"]);
    expect(deps.getOwnedPeopleMemoryWork).toHaveBeenCalledTimes(2);
  });

  it("runs the map alone when cards are off: no persons index, no forgotten people, no people changes", async () => {
    const deps = dependencies();
    deps.isPeopleMemoryEnabled.mockReturnValue(false);
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toMatchObject({
      ok: true,
      updated: true,
    });
    const input = deps.generatePeopleMemory.mock.calls[0][0];
    expect(input).toMatchObject({ peopleEnabled: false, topicsEnabled: true, persons: [], forgottenPeople: [] });
    expect(input.difficulties?.[0].persons).toEqual([]);
    const saved = deps.saveOwnedPeopleMemoryWork.mock.calls[0][2].changes;
    expect(saved.newPersons).toEqual([]);
    expect(saved.updates).toEqual([]);
    expect(saved.difficultyUpdates).toHaveLength(1);

    const topicsPreferenceOff = dependencies();
    topicsPreferenceOff.getOwnedPeopleMemoryWork
      .mockReset()
      .mockResolvedValueOnce(ok({ ...work, topicsEnabled: false }))
      .mockResolvedValue(ok({ ...readyWork, topicsEnabled: false }));
    await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, topicsPreferenceOff);
    expect(topicsPreferenceOff.generatePeopleMemory.mock.calls[0][0]).toMatchObject({
      topicsEnabled: false,
      difficulties: [],
    });
    expect(topicsPreferenceOff.saveOwnedPeopleMemoryWork.mock.calls[0][2].changes.newDifficulties).toEqual([]);
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
      changes: { newPersons: [], updates: [], ...noDifficultyChanges, incomplete: false },
    });
    expect(await prepareOwnedPeopleMemory(context, avatar, { locale: "pl" }, deps)).toMatchObject({
      ok: true,
      updated: true,
    });
    expect(deps.saveOwnedPeopleMemoryWork.mock.calls[0][2].changes).toEqual({
      newPersons: [],
      updates: [],
      newDifficulties: [],
      difficultyUpdates: [],
    });
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
