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
  DifficultyEntryDraft,
  DifficultyEntryReplacement,
  DifficultyPersonLinkDraft,
  PeopleMemoryChanges,
  PeopleMemoryDifficultyUpdate,
  PeopleMemoryFactDraft,
  PeopleMemoryFactReplacement,
  PeopleMemoryNewDifficulty,
  PeopleMemoryNewPerson,
  PeopleMemoryPersonUpdate,
  PeopleMemoryRefIndex,
} from "./people-memory-types";
import {
  DIFFICULTY_ALIAS_MAX_CHARS,
  DIFFICULTY_ENTRY_MAX_CHARS,
  DIFFICULTY_LABEL_MAX_CHARS,
  DIFFICULTY_RESPONSE_MAX_ALIASES,
  DIFFICULTY_RESPONSE_MAX_ENTRIES,
  DIFFICULTY_RESPONSE_MAX_NEW,
  allowsDifficultyEffect,
  isAllowedDifficultyParent,
  isDifficultyEffect,
  isDifficultyEntryKind,
  normalizeDifficultyLabel,
  type DifficultyEffect,
  type DifficultyEntryKind,
} from "./topic-map-budget";

// Twardo na strukturę (zamknięte zbiory kluczy, typy, enum), łagodnie na
// semantykę: nieznane refy i indeksy rozmów są pomijane, teksty przycinane,
// limity odpowiedzi egzekwowane — a ich przekroczenie oznacza partię do podziału.
const CHANGES_KEYS = new Set(["newPersons", "updates", "newDifficulties", "difficultyUpdates", "incomplete"]);
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
const NEW_DIFFICULTY_KEYS = new Set(["label", "aliases", "persons", "entries"]);
const DIFFICULTY_UPDATE_KEYS = new Set([
  "difficultyRef",
  "addAliases",
  "addPersons",
  "addEntries",
  "replaceEntries",
  "removeEntryRefs",
  "mentionedInConversations",
]);
const DIFFICULTY_PERSON_KEYS = new Set(["personRef", "newPersonPosition", "uncertain"]);
const DIFFICULTY_ENTRY_KEYS = new Set([
  "kind",
  "text",
  "effect",
  "personRef",
  "newPersonPosition",
  "parentRef",
  "parentPosition",
  "conversationIndex",
]);
const DIFFICULTY_REPLACEMENT_KEYS = new Set(["entryRef", "kind", "text", "effect", "conversationIndex"]);

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
  const rawNewDifficulties = requireArray(value.newDifficulties);
  const rawDifficultyUpdates = requireArray(value.difficultyUpdates);
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

  // Pozycja w surowej odpowiedzi → pozycja po deduplikacji: trudności wskazują
  // osoby tworzone w tej samej odpowiedzi właśnie po pozycji.
  const newPersons: PeopleMemoryNewPerson[] = [];
  const keptPersonByRawPosition = new Map<number, number>();
  const keptPersonByIdentity = new Map<string, number>();
  for (const [rawPosition, entry] of rawNewPersons.entries()) {
    const person = parseNewPerson(entry, index);
    if (!person) continue;
    const identity = `${normalizePersonName(person.name)}|${person.relation ? normalizePersonName(person.relation) : ""}`;
    const kept = keptPersonByIdentity.get(identity);
    if (kept !== undefined) {
      keptPersonByRawPosition.set(rawPosition, kept);
      continue;
    }
    if (newPersons.length >= PEOPLE_RESPONSE_MAX_NEW_PERSONS) {
      capped = true;
      break;
    }
    person.facts = takeFacts(person.facts);
    if (person.facts.length === 0) {
      capped = true;
      break;
    }
    keptPersonByIdentity.set(identity, newPersons.length);
    keptPersonByRawPosition.set(rawPosition, newPersons.length);
    newPersons.push(person);
  }

  const difficultyContext: DifficultyParseContext = {
    index,
    keptPersonByRawPosition,
    entryBudget: DIFFICULTY_RESPONSE_MAX_ENTRIES,
    aliasBudget: DIFFICULTY_RESPONSE_MAX_ALIASES,
    capped: false,
  };

  const difficultyUpdates: PeopleMemoryDifficultyUpdate[] = [];
  const seenDifficultyRefs = new Set<number>();
  for (const entry of rawDifficultyUpdates) {
    const update = parseDifficultyUpdate(entry, difficultyContext);
    if (!update || seenDifficultyRefs.has(update.difficultyRef)) continue;
    seenDifficultyRefs.add(update.difficultyRef);
    difficultyUpdates.push(update);
  }

  const newDifficulties: PeopleMemoryNewDifficulty[] = [];
  const newDifficultyByKey = new Map<string, number>();
  for (const entry of rawNewDifficulties) {
    const difficulty = parseNewDifficulty(entry, difficultyContext);
    if (!difficulty) continue;
    const keys = [normalizeDifficultyLabel(difficulty.label), ...difficulty.aliases.map(normalizeDifficultyLabel)];
    const existing = keys.map((key) => newDifficultyByKey.get(key)).find((position) => position !== undefined);
    if (existing !== undefined) {
      // Dwa sformułowania jednego wzorca w jednej odpowiedzi zostają jednym elementem.
      mergeNewDifficulty(newDifficulties[existing], difficulty);
      for (const key of keys) newDifficultyByKey.set(key, existing);
      continue;
    }
    if (newDifficulties.length >= DIFFICULTY_RESPONSE_MAX_NEW) {
      difficultyContext.capped = true;
      break;
    }
    for (const key of keys) newDifficultyByKey.set(key, newDifficulties.length);
    newDifficulties.push(difficulty);
  }

  return {
    newPersons,
    updates,
    newDifficulties,
    difficultyUpdates,
    incomplete: value.incomplete || capped || difficultyContext.capped,
  };
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
  const mentionedInConversations = parseConversationIndexes(entry.mentionedInConversations, index);
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

// --- Mapa tematów -----------------------------------------------------------

interface DifficultyParseContext {
  index: PeopleMemoryRefIndex;
  keptPersonByRawPosition: ReadonlyMap<number, number>;
  entryBudget: number;
  aliasBudget: number;
  capped: boolean;
}

function parseNewDifficulty(entry: unknown, context: DifficultyParseContext): PeopleMemoryNewDifficulty | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, NEW_DIFFICULTY_KEYS);
  const label = limitText(requireString(entry.label), DIFFICULTY_LABEL_MAX_CHARS);
  const aliases = parseAliases(entry.aliases, context, [label]);
  const persons = parsePersonLinks(entry.persons, context);
  // Nowa trudność nie ma wpisów w indeksie, więc rodzic tylko po pozycji.
  const entries = parseEntryList(entry.entries, context, null);
  if (!label || entries.length === 0) return null;

  return { label, aliases, persons, entries };
}

function parseDifficultyUpdate(entry: unknown, context: DifficultyParseContext): PeopleMemoryDifficultyUpdate | null {
  if (!isRecord(entry)) throwInvalidProviderResponse();
  rejectUnknownKeys(entry, DIFFICULTY_UPDATE_KEYS);
  const difficultyRef = requireInteger(entry.difficultyRef);
  const addAliases = parseAliases(entry.addAliases, context, []);
  const addPersons = parsePersonLinks(entry.addPersons, context);
  const knownEntryKinds = context.index.entryKindByRef.get(difficultyRef) ?? new Map<number, DifficultyEntryKind>();
  const addEntries = parseEntryList(entry.addEntries, context, knownEntryKinds);
  const replaceEntries = requireArray(entry.replaceEntries)
    .map((item) => parseEntryReplacement(item, context, knownEntryKinds))
    .filter((item): item is DifficultyEntryReplacement => item !== null);
  const removeEntryRefs = [
    ...new Set(
      requireArray(entry.removeEntryRefs)
        .map(requireInteger)
        .filter((ref) => knownEntryKinds.has(ref)),
    ),
  ];
  const mentionedInConversations = parseConversationIndexes(entry.mentionedInConversations, context.index);
  if (!context.index.difficultyRefs.has(difficultyRef)) return null;

  return {
    difficultyRef,
    addAliases,
    addPersons,
    addEntries,
    replaceEntries,
    removeEntryRefs,
    mentionedInConversations,
  };
}

/** Aliasy: przycięte, bez pustych i bez powtórzeń po normalizacji; wspólny budżet odpowiedzi. */
function parseAliases(value: unknown, context: DifficultyParseContext, exclude: readonly string[]) {
  const seen = new Set(exclude.map(normalizeDifficultyLabel));
  const aliases: string[] = [];
  for (const raw of requireArray(value)) {
    const alias = limitText(requireString(raw), DIFFICULTY_ALIAS_MAX_CHARS);
    if (!alias) continue;
    const normalized = normalizeDifficultyLabel(alias);
    if (seen.has(normalized)) continue;
    if (context.aliasBudget <= 0) {
      context.capped = true;
      break;
    }
    context.aliasBudget -= 1;
    seen.add(normalized);
    aliases.push(alias);
  }
  return aliases;
}

function parsePersonLinks(value: unknown, context: DifficultyParseContext) {
  const links: DifficultyPersonLinkDraft[] = [];
  const seen = new Set<string>();
  for (const raw of requireArray(value)) {
    if (!isRecord(raw)) throwInvalidProviderResponse();
    rejectUnknownKeys(raw, DIFFICULTY_PERSON_KEYS);
    if (typeof raw.uncertain !== "boolean") throwInvalidProviderResponse();
    const resolved = resolvePersonReference(raw, context);
    // Powiązanie bez osoby nie jest powiązaniem (wpis bez osoby jest ogólny).
    if (!resolved || (resolved.personRef === null && resolved.newPersonPosition === null)) continue;
    const identity = resolved.personRef !== null ? `ref:${resolved.personRef}` : `new:${resolved.newPersonPosition}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    links.push({ ...resolved, uncertain: raw.uncertain });
  }
  return links;
}

/**
 * Osoba po refie z indeksu albo po pozycji w newPersons (już po deduplikacji).
 * Ref wygrywa z pozycją; nieznany ref lub pozycja → `null` (pominięcie).
 */
function resolvePersonReference(
  raw: Record<string, unknown>,
  context: DifficultyParseContext,
): { personRef: number | null; newPersonPosition: number | null } | null {
  const personRef = parseOptionalInteger(raw.personRef);
  const rawPosition = parseOptionalInteger(raw.newPersonPosition);
  if (personRef !== null)
    return context.index.personRefs.has(personRef) ? { personRef, newPersonPosition: null } : null;
  if (rawPosition !== null) {
    const kept = context.keptPersonByRawPosition.get(rawPosition);
    return kept === undefined ? null : { personRef: null, newPersonPosition: kept };
  }
  return { personRef: null, newPersonPosition: null };
}

/**
 * Lista nowych wpisów: pozycje rodziców przepisane na pozycje po filtrach,
 * rodzic z indeksu tylko z dozwoloną parą, `effect` tylko tam, gdzie wolno.
 * Wpis przy nieznanej osobie odpada w całości; przekroczony budżet → incomplete.
 */
function parseEntryList(
  value: unknown,
  context: DifficultyParseContext,
  knownEntryKinds: ReadonlyMap<number, DifficultyEntryKind> | null,
) {
  const kept: DifficultyEntryDraft[] = [];
  const keptByRawPosition = new Map<number, number>();
  for (const [rawPosition, raw] of requireArray(value).entries()) {
    const draft = parseEntry(raw, context, knownEntryKinds);
    if (!draft) continue;
    if (draft.parentRef === null && draft.parentPosition !== null) {
      const keptPosition = draft.parentPosition < rawPosition ? keptByRawPosition.get(draft.parentPosition) : undefined;
      draft.parentPosition =
        keptPosition !== undefined && isAllowedDifficultyParent(draft.kind, kept[keptPosition].kind)
          ? keptPosition
          : null;
    } else {
      draft.parentPosition = null;
    }
    if (context.entryBudget <= 0) {
      context.capped = true;
      continue;
    }
    context.entryBudget -= 1;
    keptByRawPosition.set(rawPosition, kept.length);
    kept.push(draft);
  }
  return kept;
}

function parseEntry(
  raw: unknown,
  context: DifficultyParseContext,
  knownEntryKinds: ReadonlyMap<number, DifficultyEntryKind> | null,
): DifficultyEntryDraft | null {
  if (!isRecord(raw)) throwInvalidProviderResponse();
  rejectUnknownKeys(raw, DIFFICULTY_ENTRY_KEYS);
  const kind = raw.kind;
  if (!isDifficultyEntryKind(kind)) throwInvalidProviderResponse();
  const text = limitText(requireString(raw.text), DIFFICULTY_ENTRY_MAX_CHARS);
  const effect = parseEffect(raw.effect, kind);
  const conversationIndex = requireInteger(raw.conversationIndex);
  const parentRef = parseOptionalInteger(raw.parentRef);
  const parentPosition = parseOptionalInteger(raw.parentPosition);
  const person = resolvePersonReference(raw, context);
  if (!text || !isKnownConversation(conversationIndex, context.index) || !person) return null;
  const parentKind = parentRef !== null ? knownEntryKinds?.get(parentRef) : undefined;
  const validParentRef = parentKind !== undefined && isAllowedDifficultyParent(kind, parentKind) ? parentRef : null;

  return {
    kind,
    text,
    effect,
    personRef: person.personRef,
    newPersonPosition: person.newPersonPosition,
    parentRef: validParentRef,
    parentPosition,
    conversationIndex,
  };
}

function parseEntryReplacement(
  raw: unknown,
  context: DifficultyParseContext,
  knownEntryKinds: ReadonlyMap<number, DifficultyEntryKind>,
): DifficultyEntryReplacement | null {
  if (!isRecord(raw)) throwInvalidProviderResponse();
  rejectUnknownKeys(raw, DIFFICULTY_REPLACEMENT_KEYS);
  const entryRef = requireInteger(raw.entryRef);
  const kind = raw.kind;
  if (!isDifficultyEntryKind(kind)) throwInvalidProviderResponse();
  const text = limitText(requireString(raw.text), DIFFICULTY_ENTRY_MAX_CHARS);
  const effect = parseEffect(raw.effect, kind);
  const conversationIndex = requireInteger(raw.conversationIndex);
  // Poprawka w miejscu zachowuje rodzaj: inny rodzaj to nie poprawka.
  if (!text || !isKnownConversation(conversationIndex, context.index) || knownEntryKinds.get(entryRef) !== kind) {
    return null;
  }
  if (context.entryBudget <= 0) {
    context.capped = true;
    return null;
  }
  context.entryBudget -= 1;

  return { entryRef, kind, text, effect, conversationIndex };
}

/** `none` to brak oceny; inna nieznana wartość to zła struktura; ocena na złym rodzaju jest zerowana. */
function parseEffect(value: unknown, kind: DifficultyEntryKind): DifficultyEffect | null {
  const effect = requireString(value);
  if (effect === "none") return null;
  if (!isDifficultyEffect(effect)) throwInvalidProviderResponse();
  return allowsDifficultyEffect(kind) ? effect : null;
}

function mergeNewDifficulty(target: PeopleMemoryNewDifficulty, source: PeopleMemoryNewDifficulty) {
  const offset = target.entries.length;
  for (const alias of [source.label, ...source.aliases]) {
    const normalized = normalizeDifficultyLabel(alias);
    if (normalizeDifficultyLabel(target.label) === normalized) continue;
    if (target.aliases.some((existing) => normalizeDifficultyLabel(existing) === normalized)) continue;
    target.aliases.push(alias);
  }
  for (const link of source.persons) {
    const duplicate = target.persons.some(
      (existing) => existing.personRef === link.personRef && existing.newPersonPosition === link.newPersonPosition,
    );
    if (!duplicate) target.persons.push(link);
  }
  for (const entry of source.entries) {
    target.entries.push({
      ...entry,
      parentPosition: entry.parentPosition === null ? null : entry.parentPosition + offset,
    });
  }
}

// --- Wspólne ----------------------------------------------------------------

function parseConversationIndexes(value: unknown, index: PeopleMemoryRefIndex) {
  return [
    ...new Set(
      requireArray(value)
        .map(requireInteger)
        .filter((conversationIndex) => isKnownConversation(conversationIndex, index)),
    ),
  ];
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

function parseOptionalInteger(value: unknown): number | null {
  return value === null ? null : requireInteger(value);
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
