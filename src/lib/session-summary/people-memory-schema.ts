import { PEOPLE_FACT_KINDS } from "./people-memory-budget";
import { DIFFICULTY_EFFECTS, DIFFICULTY_ENTRY_KINDS } from "./topic-map-budget";

// Strict structured output (jak klasyfikator bezpieczeństwa): każda właściwość
// w `required`, `additionalProperties: false` na każdym obiekcie, opcje jako
// `["string", "null"]`. Limity długości i liczności egzekwuje parser i SQL —
// `maxLength`/`maxItems` nie są niezawodne w trybie strict.
const FACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: PEOPLE_FACT_KINDS },
    text: { type: "string", description: "One small fact in the user's own perspective." },
    conversationIndex: { type: "integer", description: "conversationIndex of the message the fact comes from." },
  },
  required: ["kind", "text", "conversationIndex"],
} as const;

/** Ocena jako enum z `none` zamiast `null`: jednoznaczne w trybie strict u każdego providera. */
export const DIFFICULTY_EFFECT_SCHEMA_VALUES = [...DIFFICULTY_EFFECTS, "none"] as const;

const DIFFICULTY_PERSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    personRef: { type: ["integer", "null"], description: "ref of a known person, or null." },
    newPersonPosition: {
      type: ["integer", "null"],
      description: "0-based index of a person created in newPersons of this same response, or null.",
    },
    uncertain: { type: "boolean", description: "true when it is unclear whether the difficulty concerns this person." },
  },
  required: ["personRef", "newPersonPosition", "uncertain"],
} as const;

const DIFFICULTY_ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: DIFFICULTY_ENTRY_KINDS },
    text: { type: "string", description: "One small entry in the user's own words." },
    effect: {
      type: "string",
      enum: DIFFICULTY_EFFECT_SCHEMA_VALUES,
      description: "Only for update and outcome, only from the user's words; none otherwise.",
    },
    personRef: { type: ["integer", "null"], description: "ref of a known person this entry concerns, or null." },
    newPersonPosition: {
      type: ["integer", "null"],
      description: "0-based index of a person created in newPersons of this same response, or null.",
    },
    parentRef: {
      type: ["integer", "null"],
      description: "ref of the existing suggested/agreed entry this agreed/outcome entry answers, or null.",
    },
    parentPosition: {
      type: ["integer", "null"],
      description: "0-based position of an earlier entry in this same list that this entry answers, or null.",
    },
    conversationIndex: { type: "integer", description: "conversationIndex of the message the entry comes from." },
  },
  required: [
    "kind",
    "text",
    "effect",
    "personRef",
    "newPersonPosition",
    "parentRef",
    "parentPosition",
    "conversationIndex",
  ],
} as const;

export const OPENROUTER_PEOPLE_MEMORY_RESPONSE_SCHEMA = {
  name: "safespace_people_memory_changes",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      newPersons: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            relation: { type: ["string", "null"] },
            facts: { type: "array", items: FACT_SCHEMA },
          },
          required: ["name", "relation", "facts"],
        },
      },
      updates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            personRef: { type: "integer" },
            relation: { type: ["string", "null"], description: "null means no change." },
            addFacts: { type: "array", items: FACT_SCHEMA },
            replaceFacts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  factRef: { type: "integer" },
                  kind: { type: "string", enum: PEOPLE_FACT_KINDS },
                  text: { type: "string" },
                  conversationIndex: { type: "integer" },
                },
                required: ["factRef", "kind", "text", "conversationIndex"],
              },
            },
            removeFactRefs: { type: "array", items: { type: "integer" } },
            mentionedInConversations: { type: "array", items: { type: "integer" } },
          },
          required: ["personRef", "relation", "addFacts", "replaceFacts", "removeFactRefs", "mentionedInConversations"],
        },
      },
      newDifficulties: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: {
              type: "string",
              description: "Short noun phrase in the user's words; never a name or a diagnosis.",
            },
            aliases: { type: "array", items: { type: "string" } },
            persons: { type: "array", items: DIFFICULTY_PERSON_SCHEMA },
            entries: { type: "array", items: DIFFICULTY_ENTRY_SCHEMA },
          },
          required: ["label", "aliases", "persons", "entries"],
        },
      },
      difficultyUpdates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            difficultyRef: { type: "integer" },
            addAliases: { type: "array", items: { type: "string" } },
            addPersons: { type: "array", items: DIFFICULTY_PERSON_SCHEMA },
            addEntries: { type: "array", items: DIFFICULTY_ENTRY_SCHEMA },
            replaceEntries: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  entryRef: { type: "integer" },
                  kind: { type: "string", enum: DIFFICULTY_ENTRY_KINDS },
                  text: { type: "string" },
                  effect: { type: "string", enum: DIFFICULTY_EFFECT_SCHEMA_VALUES },
                  conversationIndex: { type: "integer" },
                },
                required: ["entryRef", "kind", "text", "effect", "conversationIndex"],
              },
            },
            removeEntryRefs: { type: "array", items: { type: "integer" } },
            mentionedInConversations: { type: "array", items: { type: "integer" } },
          },
          required: [
            "difficultyRef",
            "addAliases",
            "addPersons",
            "addEntries",
            "replaceEntries",
            "removeEntryRefs",
            "mentionedInConversations",
          ],
        },
      },
      incomplete: { type: "boolean" },
    },
    required: ["newPersons", "updates", "newDifficulties", "difficultyUpdates", "incomplete"],
  },
} as const;
