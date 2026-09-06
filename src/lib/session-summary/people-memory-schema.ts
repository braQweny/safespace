import { PEOPLE_FACT_KINDS } from "./people-memory-budget";

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
      incomplete: { type: "boolean" },
    },
    required: ["newPersons", "updates", "incomplete"],
  },
} as const;
