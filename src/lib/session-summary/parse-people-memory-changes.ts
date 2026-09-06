import type { ChatResult } from "@openrouter/sdk/models";
import { isRecord } from "@/lib/type-guards";
import { SessionSummaryError } from "./errors";
import { assertCompleteSummaryResponse } from "./provider-response";
import {
  PEOPLE_FACT_MAX_CHARS,
  PEOPLE_NAME_MAX_CHARS,
  PEOPLE_RELATION_MAX_CHARS,
  PEOPLE_RESPONSE_MAX_FACTS,
  PEOPLE_RESPONSE_MAX_NEW_PERSONS,
  isPeopleFactKind,
  normalizePersonName,
} from "./people-memory-budget";
import type {
  PeopleMemoryChanges,
  PeopleMemoryFactDraft,
  PeopleMemoryFactReplacement,
  PeopleMemoryNewPerson,
  PeopleMemoryPersonUpdate,
  PeopleMemoryRefIndex,
} from "./people-memory-types";

// Twardo na strukturę (zamknięte zbiory kluczy, typy, enum), łagodnie na
// semantykę: nieznane refy i indeksy rozmów są pomijane, teksty przycinane,
// limity odpowiedzi egzekwowane — a ich przekroczenie oznacza partię do podziału.
const CHANGES_KEYS = new Set(["newPersons", "updates", "incomplete"]);
const NEW_PERSON_KEYS = new Set(["name", "relation", "facts"]);
const UPDATE_KEYS = new Set([
  "personRef",
  "relation",
  "addFacts",
  "replaceFacts",
  "removeFactRefs",
  "mentionedInConversations",
]);
const FACT_KEYS = new Set(["kind", "text", "conversationIndex"]);
const REPLACEMENT_KEYS = new Set(["factRef", "kind", "text", "conversationIndex"]);

export function parsePeopleMemoryChanges(response: ChatResult, index: PeopleMemoryRefIndex): PeopleMemoryChanges {
  assertCompleteSummaryResponse(response);
  const content = extractFirstChoiceContent(response);

  return parsePeopleMemoryChangesObject(parseJsonObject(content), index);
}

export function parsePeopleMemoryChangesObject(
  value: Record<string, unknown>,
  index: PeopleMemoryRefIndex,
): PeopleMemoryChanges {
  rejectUnknownKeys(value, CHANGES_KEYS);
  const rawNewPersons = requireArray(value.newPersons);
  const rawUpdates = requireArray(value.updates);
  if (typeof value.incomplete !== "boolean") throwInvalidProviderResponse();

  let factBudget = PEOPLE_RESPONSE_MAX_FACTS;
  let capped = false;
  const takeFacts = <T extends PeopleMemoryFactDraft>(facts: T[]) => {
    const taken = facts.slice(0, factBudget);
    if (taken.length < facts.length) capped = true;
    factBudget -= taken.length;
    return taken;
  };

  const updates: PeopleMemoryPersonUpdate[] = [];
  const seenPersonRefs = new Set<number>();
  for (const entry of rawUpdates) {
    const update = parseUpdate(entry, index);
    if (!update || seenPersonRefs.has(update.personRef)) continue;
    seenPersonRefs.add(update.personRef);
    update.replaceFacts = takeFacts(update.replaceFacts);
    update.addFacts = takeFacts(update.addFacts);
    updates.push(update);
  }

  const newPersons: PeopleMemoryNewPerson[] = [];
  const seenNames = new Set<string>();
  for (const entry of rawNewPersons) {
    const person = parseNewPerson(entry, index);
    if (!person) continue;
    const identity = `${normalizePersonName(person.name)}|${person.relation ? normalizePersonName(person.relation) : ""}`;
    if (seenNames.has(identity)) continue;
    if (newPersons.length >= PEOPLE_RESPONSE_MAX_NEW_PERSONS) {
      capped = true;
      break;
    }
    person.facts = takeFacts(person.facts);
    if (person.facts.length === 0) {
      capped = true;
      break;
    }
    seenNames.add(identity);
    newPersons.push(person);
  }

  return { newPersons, updates, incomplete: value.incomplete || capped };
}

function parseNewPerson(entry: unknown, index: PeopleMemoryRefIndex): PeopleMemoryNewPerson | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, NEW_PERSON_KEYS);
  const name = limitText(requireString(entry.name), PEOPLE_NAME_MAX_CHARS);
  const relation = parseOptionalText(entry.relation, PEOPLE_RELATION_MAX_CHARS);
  const facts = requireArray(entry.facts)
    .map((fact) => parseFact(fact, index))
    .filter((fact): fact is PeopleMemoryFactDraft => fact !== null);
  if (!name || facts.length === 0) return null;

  return { name, relation, facts };
}

function parseUpdate(entry: unknown, index: PeopleMemoryRefIndex): PeopleMemoryPersonUpdate | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, UPDATE_KEYS);
  const personRef = requireInteger(entry.personRef);
  const relation = parseOptionalText(entry.relation, PEOPLE_RELATION_MAX_CHARS);
  const addFacts = requireArray(entry.addFacts)
    .map((fact) => parseFact(fact, index))
    .filter((fact): fact is PeopleMemoryFactDraft => fact !== null);
  const knownFactRefs = index.factRefsByPerson.get(personRef) ?? new Set<number>();
  const replaceFacts = requireArray(entry.replaceFacts)
    .map((fact) => parseReplacement(fact, index, knownFactRefs))
    .filter((fact): fact is PeopleMemoryFactReplacement => fact !== null);
  const removeFactRefs = [
    ...new Set(
      requireArray(entry.removeFactRefs)
        .map(requireInteger)
        .filter((ref) => knownFactRefs.has(ref)),
    ),
  ];
  const mentionedInConversations = [
    ...new Set(
      requireArray(entry.mentionedInConversations)
        .map(requireInteger)
        .filter((conversationIndex) => isKnownConversation(conversationIndex, index)),
    ),
  ];
  if (!index.personRefs.has(personRef)) return null;

  return { personRef, relation, addFacts, replaceFacts, removeFactRefs, mentionedInConversations };
}

function parseFact(entry: unknown, index: PeopleMemoryRefIndex): PeopleMemoryFactDraft | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, FACT_KEYS);
  return buildFact(entry, index);
}

function parseReplacement(
  entry: unknown,
  index: PeopleMemoryRefIndex,
  knownFactRefs: ReadonlySet<number>,
): PeopleMemoryFactReplacement | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, REPLACEMENT_KEYS);
  const factRef = requireInteger(entry.factRef);
  const fact = buildFact(entry, index);
  if (!fact || !knownFactRefs.has(factRef)) return null;

  return { ...fact, factRef };
}

function buildFact(entry: Record<string, unknown>, index: PeopleMemoryRefIndex): PeopleMemoryFactDraft | null {
  const kind = entry.kind;
  if (!isPeopleFactKind(kind)) throwInvalidProviderResponse();
  const text = limitText(requireString(entry.text), PEOPLE_FACT_MAX_CHARS);
  const conversationIndex = requireInteger(entry.conversationIndex);
  if (!text || !isKnownConversation(conversationIndex, index)) return null;

  return { kind, text, conversationIndex };
}

function isKnownConversation(conversationIndex: number, index: PeopleMemoryRefIndex) {
  return conversationIndex >= 1 && conversationIndex <= index.conversationCount;
}

function extractFirstChoiceContent(response: ChatResult) {
  if (response.choices.length === 0) throwInvalidProviderResponse();
  const content: unknown = response.choices[0].message.content;
  if (typeof content !== "string" || content.trim().length === 0) throwInvalidProviderResponse();

  return content;
}

function parseJsonObject(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throwInvalidProviderResponse();
  }
  if (!isRecord(parsed)) throwInvalidProviderResponse();

  return parsed;
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(value).some((key) => !allowed.has(key))) throwInvalidProviderResponse();
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throwInvalidProviderResponse();

  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throwInvalidProviderResponse();

  return value;
}

function requireInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throwInvalidProviderResponse();

  return value;
}

function parseOptionalText(value: unknown, maxChars: number) {
  if (value === null) return null;
  const text = limitText(requireString(value), maxChars);

  return text.length > 0 ? text : null;
}

/** Przycina po znakach Unicode, żeby limit zgadzał się z `length()` w bazie. */
function limitText(value: string, maxChars: number) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const chars = Array.from(trimmed);

  return chars.length > maxChars ? chars.slice(0, maxChars).join("").trimEnd() : trimmed;
}

function throwInvalidProviderResponse(): never {
  throw new SessionSummaryError("invalid_provider_response");
}
