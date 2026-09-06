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
  conversationCount: 2,
};

const fact = (text: string, conversationIndex = 1, kind = "account") => ({ kind, text, conversationIndex });

function changes(overrides: Record<string, unknown> = {}) {
  return { newPersons: [], updates: [], incomplete: false, ...overrides };
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
