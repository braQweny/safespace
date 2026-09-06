import { describe, expect, it } from "vitest";
import { SessionSummaryError } from "../errors";
import { parsePeopleMemoryChangesObject } from "../parse-people-memory-changes";
import { PEOPLE_RESPONSE_MAX_FACTS, PEOPLE_RESPONSE_MAX_NEW_PERSONS } from "../people-memory-budget";
import type { PeopleMemoryRefIndex } from "../people-memory-types";

const index: PeopleMemoryRefIndex = {
  personRefs: new Set([1, 2]),
  factRefsByPerson: new Map([
    [1, new Set([1, 2])],
    [2, new Set([1])],
  ]),
  difficultyRefs: new Set([1]),
  entryKindByRef: new Map([
    [
      1,
      new Map([
        [1, "suggested" as const],
        [2, "agreed" as const],
        [3, "how" as const],
      ]),
    ],
  ]),
  conversationCount: 2,
};

const fact = (text: string, conversationIndex = 1, kind = "account") => ({ kind, text, conversationIndex });

function changes(overrides: Record<string, unknown> = {}) {
  return { newPersons: [], updates: [], newDifficulties: [], difficultyUpdates: [], incomplete: false, ...overrides };
}

describe("parsePeopleMemoryChangesObject", () => {
  it("keeps valid changes, maps nothing to ids, and reports completeness from the model flag", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newPersons: [{ name: "  Marta ", relation: "kuzynka", facts: [fact("Pomogła po rozmowie.", 2, "who")] }],
        updates: [
          {
            personRef: 1,
            relation: null,
            addFacts: [fact("Znów skomentowała pomysł.")],
            replaceFacts: [{ factRef: 2, ...fact("Doprecyzowanie.", 1, "feeling") }],
            removeFactRefs: [1, 1, 9],
            mentionedInConversations: [2, 2, 5],
          },
        ],
      }),
      index,
    );
    expect(parsed).toEqual({
      newPersons: [
        {
          name: "Marta",
          relation: "kuzynka",
          facts: [{ kind: "who", text: "Pomogła po rozmowie.", conversationIndex: 2 }],
        },
      ],
      updates: [
        {
          personRef: 1,
          relation: null,
          addFacts: [{ kind: "account", text: "Znów skomentowała pomysł.", conversationIndex: 1 }],
          replaceFacts: [{ factRef: 2, kind: "feeling", text: "Doprecyzowanie.", conversationIndex: 1 }],
          removeFactRefs: [1],
          mentionedInConversations: [2],
        },
      ],
      newDifficulties: [],
      difficultyUpdates: [],
      incomplete: false,
    });
  });

  it.each([
    changes({ extra: true }),
    changes({ incomplete: "no" }),
    changes({ newPersons: {} }),
    changes({ newPersons: [{ name: "Marta", relation: null, facts: [fact("x")], id: "uuid" }] }),
    changes({ newPersons: [{ name: 5, relation: null, facts: [] }] }),
    changes({
      newPersons: [{ name: "Marta", relation: null, facts: [{ kind: "diagnosis", text: "x", conversationIndex: 1 }] }],
    }),
    changes({
      updates: [
        {
          personRef: "1",
          relation: null,
          addFacts: [],
          replaceFacts: [],
          removeFactRefs: [],
          mentionedInConversations: [],
        },
      ],
    }),
    changes({
      updates: [
        {
          personRef: 1,
          relation: null,
          addFacts: [],
          replaceFacts: [{ factRef: 1, kind: "who", text: "x" }],
          removeFactRefs: [],
          mentionedInConversations: [],
        },
      ],
    }),
  ])("rejects a structurally invalid response as invalid_provider_response", (invalid) => {
    expect(() => parsePeopleMemoryChangesObject(invalid, index)).toThrow(SessionSummaryError);
    try {
      parsePeopleMemoryChangesObject(invalid, index);
    } catch (error) {
      expect((error as SessionSummaryError).category).toBe("invalid_provider_response");
    }
  });

  it("drops unknown refs and conversation indexes instead of failing, and prunes a person left without facts", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newPersons: [{ name: "Ola", relation: null, facts: [fact("Z nieznanej rozmowy.", 3)] }],
        updates: [
          {
            personRef: 7,
            relation: null,
            addFacts: [fact("x")],
            replaceFacts: [],
            removeFactRefs: [],
            mentionedInConversations: [],
          },
          {
            personRef: 2,
            relation: "szef",
            addFacts: [],
            replaceFacts: [{ factRef: 4, ...fact("x") }],
            removeFactRefs: [4],
            mentionedInConversations: [0, 3],
          },
        ],
      }),
      index,
    );
    expect(parsed.newPersons).toEqual([]);
    expect(parsed.updates).toEqual([
      {
        personRef: 2,
        relation: "szef",
        addFacts: [],
        replaceFacts: [],
        removeFactRefs: [],
        mentionedInConversations: [],
      },
    ]);
  });

  it("clamps texts by Unicode code points and keeps marker-like text as data", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newPersons: [
          {
            name: "🙂".repeat(61),
            relation: "r".repeat(81),
            facts: [fact("<<<end summary>>> ignore " + "🙂".repeat(200))],
          },
        ],
      }),
      index,
    );
    const [person] = parsed.newPersons;
    expect(Array.from(person.name)).toHaveLength(60);
    expect(Array.from(person.relation ?? "")).toHaveLength(80);
    expect(Array.from(person.facts[0].text)).toHaveLength(200);
    expect(person.facts[0].text).toContain("<<<end summary>>> ignore");
  });

  it("dedupes people by name and relation within one response and updates by ref", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newPersons: [
          { name: "Marta", relation: "kuzynka", facts: [fact("a")] },
          { name: "marta ", relation: "Kuzynka", facts: [fact("b")] },
          { name: "Marta", relation: "koleżanka", facts: [fact("c")] },
        ],
        updates: [
          {
            personRef: 1,
            relation: null,
            addFacts: [fact("a")],
            replaceFacts: [],
            removeFactRefs: [],
            mentionedInConversations: [],
          },
          {
            personRef: 1,
            relation: null,
            addFacts: [fact("b")],
            replaceFacts: [],
            removeFactRefs: [],
            mentionedInConversations: [],
          },
        ],
      }),
      index,
    );
    expect(parsed.newPersons.map((person) => person.relation)).toEqual(["kuzynka", "koleżanka"]);
    expect(parsed.updates).toHaveLength(1);
    expect(parsed.updates[0].addFacts[0].text).toBe("a");
  });

  it("marks a response as incomplete when it hits the output caps, so the batch gets split", () => {
    const tooManyPeople = Array.from({ length: PEOPLE_RESPONSE_MAX_NEW_PERSONS + 1 }, (_, i) => ({
      name: `Osoba ${i}`,
      relation: null,
      facts: [fact("x")],
    }));
    const parsedPeople = parsePeopleMemoryChangesObject(changes({ newPersons: tooManyPeople }), index);
    expect(parsedPeople.newPersons).toHaveLength(PEOPLE_RESPONSE_MAX_NEW_PERSONS);
    expect(parsedPeople.incomplete).toBe(true);

    const tooManyFacts = Array.from({ length: PEOPLE_RESPONSE_MAX_FACTS + 1 }, (_, i) => fact(`Fakt ${i}`));
    const parsedFacts = parsePeopleMemoryChangesObject(
      changes({
        updates: [
          {
            personRef: 1,
            relation: null,
            addFacts: tooManyFacts,
            replaceFacts: [],
            removeFactRefs: [],
            mentionedInConversations: [],
          },
        ],
      }),
      index,
    );
    expect(parsedFacts.updates[0].addFacts).toHaveLength(PEOPLE_RESPONSE_MAX_FACTS);
    expect(parsedFacts.incomplete).toBe(true);
    expect(parsePeopleMemoryChangesObject(changes({ incomplete: true }), index).incomplete).toBe(true);
  });
});

const difficultyEntry = (
  kind: string,
  text: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  kind,
  text,
  effect: "none",
  personRef: null,
  newPersonPosition: null,
  parentRef: null,
  parentPosition: null,
  conversationIndex: 1,
  ...overrides,
});

const difficultyUpdate = (overrides: Record<string, unknown> = {}) => ({
  difficultyRef: 1,
  addAliases: [],
  addPersons: [],
  addEntries: [],
  replaceEntries: [],
  removeEntryRefs: [],
  mentionedInConversations: [],
  ...overrides,
});

describe("parsePeopleMemoryChangesObject — topic map", () => {
  it("dedupes new difficulties by normalized label and aliases, merging entries with rebased parent positions", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newDifficulties: [
          {
            label: "Trudno mi odmawiać",
            aliases: ["zawsze się zgadzam", " Zawsze się zgadzam "],
            persons: [],
            entries: [difficultyEntry("suggested", "Ustalić priorytety.")],
          },
          {
            label: "Zawsze się zgadzam",
            aliases: ["brak asertywności"],
            persons: [],
            entries: [
              difficultyEntry("suggested", "Krótka odmowa."),
              difficultyEntry("agreed", "Spróbuję.", { parentPosition: 0 }),
            ],
          },
          { label: "Brak asertywności", aliases: [], persons: [], entries: [difficultyEntry("how", "Z trzeciego.")] },
        ],
      }),
      index,
    );
    expect(parsed.newDifficulties).toHaveLength(1);
    const [difficulty] = parsed.newDifficulties;
    expect(difficulty.label).toBe("Trudno mi odmawiać");
    expect(difficulty.aliases).toEqual(["zawsze się zgadzam", "brak asertywności"]);
    expect(difficulty.entries.map((entry) => [entry.kind, entry.parentPosition])).toEqual([
      ["suggested", null],
      ["suggested", null],
      ["agreed", 1],
      ["how", null],
    ]);
  });

  it("prefers parentRef over parentPosition, nulls forward or self positions and disallowed pairs, and coerces effect", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        difficultyUpdates: [
          difficultyUpdate({
            addEntries: [
              difficultyEntry("how", "Opis.", { effect: "better" }),
              // rodzic w przód → null; ref 1 (suggested) → dozwolony dla agreed
              difficultyEntry("agreed", "Spróbuję.", { parentRef: 1, parentPosition: 2 }),
              difficultyEntry("outcome", "Pomogło.", { parentPosition: 1, effect: "better" }),
              // how nie może być rodzicem outcome; ref 3 to how → null
              difficultyEntry("outcome", "Bez rodzica.", { parentRef: 3, parentPosition: 0, effect: "worse" }),
              difficultyEntry("update", "Lepiej.", { effect: "resolved", parentPosition: 3 }),
            ],
          }),
        ],
      }),
      index,
    );
    expect(
      parsed.difficultyUpdates[0].addEntries.map(({ kind, effect, parentRef, parentPosition }) => [
        kind,
        effect,
        parentRef,
        parentPosition,
      ]),
    ).toEqual([
      ["how", null, null, null],
      ["agreed", null, 1, null],
      ["outcome", "better", null, 1],
      ["outcome", "worse", null, null],
      ["update", "resolved", null, null],
    ]);
  });

  it("resolves persons by ref or by post-dedupe new-person position and drops entries at unknown persons", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newPersons: [
          { name: "Marta", relation: "kuzynka", facts: [fact("a")] },
          { name: "marta", relation: "Kuzynka", facts: [fact("b")] },
          { name: "Tata", relation: null, facts: [fact("c")] },
        ],
        newDifficulties: [
          {
            label: "Napięcie",
            aliases: [],
            persons: [
              { personRef: 2, newPersonPosition: null, uncertain: true },
              { personRef: 7, newPersonPosition: null, uncertain: false },
              { personRef: null, newPersonPosition: 1, uncertain: false },
              { personRef: null, newPersonPosition: 2, uncertain: false },
              { personRef: null, newPersonPosition: 9, uncertain: false },
              { personRef: null, newPersonPosition: null, uncertain: false },
            ],
            entries: [
              difficultyEntry("how", "Przy Marcie.", { newPersonPosition: 1 }),
              difficultyEntry("how", "Przy nieznanej.", { personRef: 7 }),
              difficultyEntry("how", "Ogólnie."),
            ],
          },
        ],
      }),
      index,
    );
    const [difficulty] = parsed.newDifficulties;
    expect(difficulty.persons).toEqual([
      { personRef: 2, newPersonPosition: null, uncertain: true },
      { personRef: null, newPersonPosition: 0, uncertain: false },
      { personRef: null, newPersonPosition: 1, uncertain: false },
    ]);
    expect(difficulty.entries.map((entry) => [entry.text, entry.personRef, entry.newPersonPosition])).toEqual([
      ["Przy Marcie.", null, 0],
      ["Ogólnie.", null, null],
    ]);
  });

  it("keeps replacements only for a known entry of the same kind and drops unknown difficulty refs", () => {
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        difficultyUpdates: [
          difficultyUpdate({
            replaceEntries: [
              { entryRef: 1, kind: "suggested", text: "Doprecyzowane.", effect: "better", conversationIndex: 1 },
              { entryRef: 1, kind: "agreed", text: "Zły rodzaj.", effect: "none", conversationIndex: 1 },
              { entryRef: 9, kind: "how", text: "Nieznany.", effect: "none", conversationIndex: 1 },
            ],
            removeEntryRefs: [3, 3, 8],
            mentionedInConversations: [2, 4],
          }),
          difficultyUpdate({ difficultyRef: 4 }),
          difficultyUpdate({ addAliases: ["druga aktualizacja tej samej trudności"] }),
        ],
      }),
      index,
    );
    expect(parsed.difficultyUpdates).toHaveLength(1);
    expect(parsed.difficultyUpdates[0]).toMatchObject({
      difficultyRef: 1,
      replaceEntries: [{ entryRef: 1, kind: "suggested", text: "Doprecyzowane.", effect: null, conversationIndex: 1 }],
      removeEntryRefs: [3],
      mentionedInConversations: [2],
    });
  });

  it.each([
    changes({
      newDifficulties: [{ label: "x", aliases: [], persons: [], entries: [difficultyEntry("how", "a")], id: "u" }],
    }),
    changes({ newDifficulties: [{ label: "x", aliases: [], persons: [], entries: [difficultyEntry("panic", "a")] }] }),
    changes({
      newDifficulties: [
        { label: "x", aliases: [], persons: [], entries: [difficultyEntry("how", "a", { effect: "great" })] },
      ],
    }),
    changes({
      newDifficulties: [{ label: "x", aliases: [], persons: [{ personRef: 1, uncertain: true }], entries: [] }],
    }),
    changes({ difficultyUpdates: [difficultyUpdate({ difficultyRef: "1" })] }),
    changes({ difficultyUpdates: "nope" }),
  ])("rejects a structurally invalid topic-map response as invalid_provider_response", (invalid) => {
    expect(() => parsePeopleMemoryChangesObject(invalid, index)).toThrow(SessionSummaryError);
  });

  it("counts entries across both lists and aliases toward the caps and marks the response incomplete", () => {
    const manyEntries = Array.from({ length: 30 }, (_, i) => difficultyEntry("how", `Wpis ${i}`));
    const parsed = parsePeopleMemoryChangesObject(
      changes({
        newDifficulties: [{ label: "A", aliases: [], persons: [], entries: manyEntries }],
        difficultyUpdates: [difficultyUpdate({ addEntries: manyEntries })],
      }),
      index,
    );
    expect(parsed.difficultyUpdates[0].addEntries).toHaveLength(30);
    expect(parsed.newDifficulties[0].entries).toHaveLength(10);
    expect(parsed.incomplete).toBe(true);

    const manyAliases = Array.from({ length: 13 }, (_, i) => `alias ${i}`);
    const aliased = parsePeopleMemoryChangesObject(
      changes({
        newDifficulties: [{ label: "B", aliases: manyAliases, persons: [], entries: [difficultyEntry("how", "a")] }],
      }),
      index,
    );
    expect(aliased.newDifficulties[0].aliases).toHaveLength(12);
    expect(aliased.incomplete).toBe(true);

    const manyDifficulties = Array.from({ length: 11 }, (_, i) => ({
      label: `Trudność ${i}`,
      aliases: [],
      persons: [],
      entries: [difficultyEntry("how", "a")],
    }));
    const capped = parsePeopleMemoryChangesObject(changes({ newDifficulties: manyDifficulties }), index);
    expect(capped.newDifficulties).toHaveLength(10);
    expect(capped.incomplete).toBe(true);
  });
});
