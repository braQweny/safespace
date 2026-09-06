import { getValidAvatarChoice } from "@/lib/modalities";
import type { Locale } from "@/lib/i18n/locale";
import type { AvatarMemoryCursor } from "@/lib/session-data/avatar-memory";
import type {
  DifficultyChangeWrite,
  DifficultyEntryWrite,
  DifficultyMemoryEntryRecord,
  DifficultyPersonLinkWrite,
  PeopleMemoryChangeSet,
  PeopleMemoryFactWrite,
  PeopleMemoryWork,
} from "@/lib/session-data/people-memory";
import { getOwnedPeopleMemoryWork, saveOwnedPeopleMemoryWork } from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext, SessionModalityId } from "@/lib/session-data/types";
import { SessionSummaryError, type SessionSummaryErrorCategory } from "@/lib/session-summary/errors";
import {
  PEOPLE_BATCH_DEFAULT_CHARS,
  PEOPLE_BATCH_MIN_CHARS,
  isWithinPeopleMemoryBudget,
  normalizePersonName,
} from "@/lib/session-summary/people-memory-budget";
import { generatePeopleMemory } from "@/lib/session-summary/people-memory-provider";
import type {
  DifficultyEntryDraft,
  DifficultyPersonLinkDraft,
  DifficultyPromptEntry,
  DifficultyPromptItem,
  ForgottenPerson,
  PeopleMemoryChanges,
  PeopleMemoryFactDraft,
  PeopleMemoryRefIndex,
  PeoplePromptPerson,
} from "@/lib/session-summary/people-memory-types";
import {
  DIFFICULTY_INDEX_MAX_ORPHAN_OUTCOMES,
  DIFFICULTY_INDEX_MAX_PER_DESCRIPTIVE_KIND,
  DIFFICULTY_INDEX_MAX_UPDATES,
  DIFFICULTY_INDEX_TEXT_MAX_CHARS,
  type DifficultyEntryKind,
} from "@/lib/session-summary/topic-map-budget";
import type { SessionSummaryConversationMessage } from "@/lib/session-summary/types";
import { isPeopleMemoryEnabled } from "./people-memory-mode";
import { isTopicMapEnabled } from "./topic-map-mode";

// Przepełniona odpowiedź dzieli partię na pół; trzy próby to 16 000 → 8 000 →
// 4 000 znaków w jednym żądaniu, potem wynik jest przyjmowany jako częściowy.
const PEOPLE_BATCH_MAX_ATTEMPTS = 3;

export interface PeopleMemoryBatch {
  messages: SessionSummaryConversationMessage[];
  cursors: AvatarMemoryCursor[];
  persons: PeoplePromptPerson[];
  difficulties: DifficultyPromptItem[];
  sessionIdByConversationIndex: ReadonlyMap<number, string>;
  personIdByRef: ReadonlyMap<number, string>;
  factIdByRef: ReadonlyMap<number, ReadonlyMap<number, string>>;
  difficultyIdByRef: ReadonlyMap<number, string>;
  entryIdByRef: ReadonlyMap<number, ReadonlyMap<number, string>>;
  refIndex: PeopleMemoryRefIndex;
}

/** Baza ogranicza partię; identyfikatory sesji, osób i trudności zostają poza promptem. */
export function buildPeopleMemoryBatch(work: PeopleMemoryWork): PeopleMemoryBatch {
  if (!isWithinPeopleMemoryBudget(work.messages)) {
    throw new TypeError("People memory input exceeds its bounded batch");
  }
  const messages: SessionSummaryConversationMessage[] = [];
  const cursors = new Map<string, AvatarMemoryCursor>();
  const sessionIdByConversationIndex = new Map<number, string>();
  for (const message of work.messages) {
    cursors.set(message.sessionId, {
      sessionId: message.sessionId,
      sequenceIndex: message.sequenceIndex,
      characterOffset: message.characterOffset,
    });
    sessionIdByConversationIndex.set(cursors.size, message.sessionId);
    messages.push({ role: message.role, content: message.content, conversationIndex: cursors.size });
  }

  const personIdByRef = new Map<number, string>();
  const personRefById = new Map<string, number>();
  const factIdByRef = new Map<number, Map<number, string>>();
  const persons: PeoplePromptPerson[] = work.persons.map((person, personIndex) => {
    const ref = personIndex + 1;
    personIdByRef.set(ref, person.id);
    personRefById.set(person.id, ref);
    const factIds = new Map<number, string>();
    factIdByRef.set(ref, factIds);
    return {
      ref,
      name: person.name,
      nameLocked: person.nameLocked,
      relation: person.relation,
      relationLocked: person.relationLocked,
      facts: person.facts.map((fact, factIndex) => {
        factIds.set(factIndex + 1, fact.id);
        return { ref: factIndex + 1, kind: fact.kind, text: fact.text, userEdited: fact.userEdited };
      }),
    };
  });

  const difficultyIdByRef = new Map<number, string>();
  const entryIdByRef = new Map<number, Map<number, string>>();
  const entryKindByRef = new Map<number, Map<number, DifficultyEntryKind>>();
  const difficulties: DifficultyPromptItem[] = work.difficulties.map((difficulty, difficultyIndex) => {
    const ref = difficultyIndex + 1;
    difficultyIdByRef.set(ref, difficulty.id);
    const entryIds = new Map<number, string>();
    const entryKinds = new Map<number, DifficultyEntryKind>();
    entryIdByRef.set(ref, entryIds);
    entryKindByRef.set(ref, entryKinds);
    const shown = selectIndexedEntries(difficulty.entries);
    const entryRefById = new Map<string, number>();
    shown.forEach((entry, entryIndex) => entryRefById.set(entry.id, entryIndex + 1));
    return {
      ref,
      label: difficulty.label,
      labelLocked: difficulty.labelLocked,
      archived: difficulty.archived,
      aliases: [...difficulty.aliases],
      // Osoby spoza indeksu (karty wyłączone) nie mają refów, więc nie idą do promptu.
      persons: difficulty.persons.flatMap((person) => {
        const personRef = personRefById.get(person.personId);
        return personRef === undefined || person.state === "rejected" ? [] : [{ personRef, state: person.state }];
      }),
      entries: shown.map((entry, entryIndex): DifficultyPromptEntry => {
        const entryRef = entryIndex + 1;
        entryIds.set(entryRef, entry.id);
        entryKinds.set(entryRef, entry.kind);
        return {
          ref: entryRef,
          kind: entry.kind,
          text: trimAndLimit(entry.text, DIFFICULTY_INDEX_TEXT_MAX_CHARS),
          effect: entry.effect,
          personRef: entry.personId === null ? null : (personRefById.get(entry.personId) ?? null),
          parentRef: entry.parentEntryId === null ? null : (entryRefById.get(entry.parentEntryId) ?? null),
          userEdited: entry.userEdited,
        };
      }),
    };
  });

  return {
    messages,
    cursors: [...cursors.values()],
    persons,
    difficulties,
    sessionIdByConversationIndex,
    personIdByRef,
    factIdByRef,
    difficultyIdByRef,
    entryIdByRef,
    refIndex: {
      personRefs: new Set(personIdByRef.keys()),
      factRefsByPerson: new Map([...factIdByRef].map(([ref, ids]) => [ref, new Set(ids.keys())])),
      difficultyRefs: new Set(difficultyIdByRef.keys()),
      entryKindByRef,
      conversationCount: cursors.size,
    },
  };
}

/**
 * Okno indeksu w prompcie: wszystkie propozycje i postanowienia (model podpina
 * pod nie feedback) z najnowszym rezultatem każdego, ostatnie rezultaty bez
 * rodzica, ostatnie „jak jest teraz” i po parę ostatnich opisów. Wpisy są
 * w kolejności dat rozmów źródłowych (tak zwraca je baza), a refy dostają
 * tylko pokazane — ref do ukrytego wpisu zachęcałby model do zgadywania.
 */
export function selectIndexedEntries(entries: readonly DifficultyMemoryEntryRecord[]) {
  const shown = new Set<string>();
  const latestOutcomeByParent = new Map<string, DifficultyMemoryEntryRecord>();
  for (const entry of entries) {
    if (entry.kind === "suggested" || entry.kind === "agreed") shown.add(entry.id);
    if (entry.kind === "outcome" && entry.parentEntryId !== null) latestOutcomeByParent.set(entry.parentEntryId, entry);
  }
  for (const outcome of latestOutcomeByParent.values()) shown.add(outcome.id);
  const takeLatest = (
    kind: DifficultyEntryKind,
    limit: number,
    filter?: (entry: DifficultyMemoryEntryRecord) => boolean,
  ) => {
    const candidates = entries.filter((entry) => entry.kind === kind && (filter ? filter(entry) : true));
    for (const entry of candidates.slice(-limit)) shown.add(entry.id);
  };
  takeLatest("outcome", DIFFICULTY_INDEX_MAX_ORPHAN_OUTCOMES, (entry) => entry.parentEntryId === null);
  takeLatest("update", DIFFICULTY_INDEX_MAX_UPDATES);
  takeLatest("how", DIFFICULTY_INDEX_MAX_PER_DESCRIPTIVE_KIND);
  takeLatest("coping", DIFFICULTY_INDEX_MAX_PER_DESCRIPTIVE_KIND);
  return entries.filter((entry) => shown.has(entry.id));
}

interface ChangeSetOptions {
  avatarFirstName: string;
  forgottenPeople: readonly ForgottenPerson[];
  /** Zmiany osób idą do zapisu tylko przy aktywnych kartach (flaga i preferencja). */
  peopleActive?: boolean;
  /** Zmiany trudności idą do zapisu tylko przy aktywnej mapie (flaga i preferencja). */
  topicsActive?: boolean;
}

function isForgotten(name: string, relation: string | null, forgottenPeople: readonly ForgottenPerson[]) {
  const normalizedName = normalizePersonName(name);
  const normalizedRelation = relation ? normalizePersonName(relation) : null;
  return forgottenPeople.some(
    (person) =>
      normalizePersonName(person.name) === normalizedName &&
      // Przy niepewności (brak relacji po którejkolwiek stronie) wygrywa prywatność.
      (person.relation === null ||
        normalizedRelation === null ||
        normalizePersonName(person.relation) === normalizedRelation),
  );
}

/** Refy i indeksy rozmów → identyfikatory; wykluczenia i imię awatara egzekwowane także tutaj. */
export function toPeopleMemoryChangeSet(
  changes: PeopleMemoryChanges,
  batch: PeopleMemoryBatch,
  options: ChangeSetOptions,
): PeopleMemoryChangeSet {
  const peopleActive = options.peopleActive !== false;
  const topicsActive = options.topicsActive !== false;
  const toWrite = (fact: PeopleMemoryFactDraft): PeopleMemoryFactWrite | null => {
    const sourceSessionId = batch.sessionIdByConversationIndex.get(fact.conversationIndex);
    return sourceSessionId ? { kind: fact.kind, text: fact.text, sourceSessionId } : null;
  };
  const avatarName = normalizePersonName(options.avatarFirstName);

  // Pozycja z odpowiedzi → pozycja w zapisie: osoby odrzucone tutaj (awatar,
  // zapomniane, bez faktów) znikają z listy, a trudności wskazują je po pozycji.
  const newPersonPositionMap = new Map<number, number>();
  const newPersons = peopleActive
    ? changes.newPersons.flatMap((person, position) => {
        if (normalizePersonName(person.name) === avatarName) return [];
        if (isForgotten(person.name, person.relation, options.forgottenPeople)) return [];
        const facts = person.facts.map(toWrite).filter((fact): fact is PeopleMemoryFactWrite => fact !== null);
        if (facts.length === 0) return [];
        newPersonPositionMap.set(position, newPersonPositionMap.size);
        return [
          {
            name: person.name,
            relation: person.relation,
            relationSourceSessionId: person.relation ? facts[0].sourceSessionId : null,
            facts,
          },
        ];
      })
    : [];

  const updates = peopleActive
    ? changes.updates.flatMap((update) => {
        const personId = batch.personIdByRef.get(update.personRef);
        if (!personId) return [];
        const factIds = batch.factIdByRef.get(update.personRef);
        const addFacts = update.addFacts.map(toWrite).filter((fact): fact is PeopleMemoryFactWrite => fact !== null);
        const replaceFacts = update.replaceFacts.flatMap((fact) => {
          const factId = factIds?.get(fact.factRef);
          const write = toWrite(fact);
          return factId && write ? [{ ...write, factId }] : [];
        });
        const removeFactIds = update.removeFactRefs.flatMap((ref) => {
          const factId = factIds?.get(ref);
          return factId ? [factId] : [];
        });
        const mentionedSessionIds = toMentionedSessionIds(batch, [
          ...update.mentionedInConversations,
          ...update.addFacts.map((fact) => fact.conversationIndex),
          ...update.replaceFacts.map((fact) => fact.conversationIndex),
        ]);
        const lastMentionedSessionId = mentionedSessionIds.at(-1) ?? null;
        return [
          {
            personId,
            relation: update.relation,
            relationSourceSessionId: update.relation ? lastMentionedSessionId : null,
            addFacts,
            replaceFacts,
            removeFactIds,
            mentionedSessionIds,
          },
        ];
      })
    : [];

  const toPersonLink = (link: DifficultyPersonLinkDraft): DifficultyPersonLinkWrite | null => {
    if (link.personRef !== null) {
      const personId = batch.personIdByRef.get(link.personRef);
      return personId ? { personId, newPersonPosition: null, uncertain: link.uncertain } : null;
    }
    if (link.newPersonPosition !== null) {
      const position = newPersonPositionMap.get(link.newPersonPosition);
      return position === undefined ? null : { personId: null, newPersonPosition: position, uncertain: link.uncertain };
    }
    return null;
  };

  const toEntryWrite = (
    entry: DifficultyEntryDraft,
    entryIds: ReadonlyMap<number, string> | undefined,
  ): DifficultyEntryWrite | null => {
    const sourceSessionId = batch.sessionIdByConversationIndex.get(entry.conversationIndex);
    if (!sourceSessionId) return null;
    const person =
      entry.personRef === null && entry.newPersonPosition === null
        ? { personId: null, newPersonPosition: null }
        : toPersonLink({ personRef: entry.personRef, newPersonPosition: entry.newPersonPosition, uncertain: false });
    if (!person) return null;
    const parentEntryId = entry.parentRef === null ? null : (entryIds?.get(entry.parentRef) ?? null);
    return {
      kind: entry.kind,
      text: entry.text,
      effect: entry.effect,
      personId: person.personId,
      newPersonPosition: person.newPersonPosition,
      parentEntryId,
      parentPosition: parentEntryId === null ? entry.parentPosition : null,
      sourceSessionId,
    };
  };

  /** Pozycje rodziców przepisane po odrzuceniu wpisów bez źródła lub osoby. */
  const toEntryWrites = (
    entries: readonly DifficultyEntryDraft[],
    entryIds: ReadonlyMap<number, string> | undefined,
  ) => {
    const writes: DifficultyEntryWrite[] = [];
    const keptByPosition = new Map<number, number>();
    entries.forEach((entry, position) => {
      const write = toEntryWrite(entry, entryIds);
      if (!write) return;
      if (write.parentPosition !== null) {
        const kept = keptByPosition.get(write.parentPosition);
        write.parentPosition = kept ?? null;
      }
      keptByPosition.set(position, writes.length);
      writes.push(write);
    });
    return writes;
  };

  const toDifficultyChange = (
    draft: {
      addAliases: string[];
      addPersons: DifficultyPersonLinkDraft[];
      addEntries: DifficultyEntryDraft[];
      replaceEntries?: PeopleMemoryChanges["difficultyUpdates"][number]["replaceEntries"];
      removeEntryRefs?: number[];
      mentionedInConversations?: number[];
    },
    entryIds: ReadonlyMap<number, string> | undefined,
  ): DifficultyChangeWrite => {
    const addEntries = toEntryWrites(draft.addEntries, entryIds);
    const replaceEntries = (draft.replaceEntries ?? []).flatMap((entry) => {
      const entryId = entryIds?.get(entry.entryRef);
      const sourceSessionId = batch.sessionIdByConversationIndex.get(entry.conversationIndex);
      return entryId && sourceSessionId
        ? [{ entryId, kind: entry.kind, text: entry.text, effect: entry.effect, sourceSessionId }]
        : [];
    });
    const mentionedSessionIds = toMentionedSessionIds(batch, [
      ...(draft.mentionedInConversations ?? []),
      ...draft.addEntries.map((entry) => entry.conversationIndex),
      ...(draft.replaceEntries ?? []).map((entry) => entry.conversationIndex),
    ]);
    const aliasSource = addEntries.at(0)?.sourceSessionId ?? mentionedSessionIds.at(-1) ?? null;
    return {
      addAliases: draft.addAliases.map((text) => ({ text, sourceSessionId: aliasSource })),
      addPersons: draft.addPersons.flatMap((link) => {
        const write = toPersonLink(link);
        return write ? [write] : [];
      }),
      addEntries,
      replaceEntries,
      removeEntryIds: (draft.removeEntryRefs ?? []).flatMap((ref) => {
        const entryId = entryIds?.get(ref);
        return entryId ? [entryId] : [];
      }),
      mentionedSessionIds,
    };
  };

  const newDifficulties = topicsActive
    ? changes.newDifficulties.flatMap((difficulty) => {
        const change = toDifficultyChange(
          { addAliases: difficulty.aliases, addPersons: difficulty.persons, addEntries: difficulty.entries },
          undefined,
        );
        return change.addEntries.length === 0 ? [] : [{ label: difficulty.label, ...change }];
      })
    : [];

  const difficultyUpdates = topicsActive
    ? changes.difficultyUpdates.flatMap((update) => {
        const difficultyId = batch.difficultyIdByRef.get(update.difficultyRef);
        if (!difficultyId) return [];
        return [{ difficultyId, ...toDifficultyChange(update, batch.entryIdByRef.get(update.difficultyRef)) }];
      })
    : [];

  return { newPersons, updates, newDifficulties, difficultyUpdates };
}

function toMentionedSessionIds(batch: PeopleMemoryBatch, conversationIndexes: readonly number[]) {
  return [...new Set(conversationIndexes)]
    .sort((left, right) => left - right)
    .flatMap((index) => {
      const sessionId = batch.sessionIdByConversationIndex.get(index);
      return sessionId ? [sessionId] : [];
    });
}

function trimAndLimit(value: string, maxChars: number) {
  const trimmed = value.trim();
  const chars = Array.from(trimmed);
  return chars.length > maxChars ? chars.slice(0, maxChars).join("").trimEnd() : trimmed;
}

const dependencies = {
  getOwnedPeopleMemoryWork,
  saveOwnedPeopleMemoryWork,
  generatePeopleMemory,
  isPeopleMemoryEnabled,
  isTopicMapEnabled,
};

export interface PeopleMemoryUsage {
  inputUnits?: number;
  outputUnits?: number;
}

export type PreparePeopleMemoryResult =
  | {
      ok: true;
      ready: boolean;
      /** Czy w tym kroku zapisano nową partię (odświeżenie listy na panelu). */
      updated: boolean;
      /** Wynik przyjęty mimo przepełnienia odpowiedzi przy najmniejszej partii. */
      partial?: boolean;
      skipped?: "mode_off" | "preference_off";
      usage?: PeopleMemoryUsage;
    }
  | { ok: false; providerFailure?: SessionSummaryErrorCategory };

/**
 * Jeden trwały krok kart osób i mapy tematów. Start rozmowy nigdy na niego nie
 * czeka; awaria zostawia kursory w miejscu, a przepełniona odpowiedź dzieli
 * partię na pół. Każda część jest aktywna, gdy włączona jest jej flaga i
 * preferencja; obie nieaktywne → nic nie jest czytane ani zapisywane.
 */
export async function prepareOwnedPeopleMemory(
  context: SessionDataContext,
  avatar: { avatarId: SessionAvatarId; modalityId: SessionModalityId },
  options: { locale: Locale },
  repository = dependencies,
): Promise<PreparePeopleMemoryResult> {
  const peopleMode = repository.isPeopleMemoryEnabled();
  const topicsMode = repository.isTopicMapEnabled();
  if (!peopleMode && !topicsMode) return { ok: true, ready: true, updated: false, skipped: "mode_off" };
  const modality = getValidAvatarChoice(avatar.modalityId, avatar.avatarId);
  if (!modality) return { ok: false };

  let maxChars = PEOPLE_BATCH_DEFAULT_CHARS;
  let usage: PeopleMemoryUsage | undefined;
  for (let attempt = 1; ; attempt += 1) {
    const work = await repository.getOwnedPeopleMemoryWork(context, avatar.avatarId, { maxChars });
    if (!work.ok) return { ok: false };
    const peopleActive = peopleMode && work.data.enabled;
    const topicsActive = topicsMode && work.data.topicsEnabled;
    if (!peopleActive && !topicsActive) return { ok: true, ready: true, updated: false, skipped: "preference_off" };
    if (work.data.messages.length === 0) return { ok: true, ready: true, updated: false, ...(usage ? { usage } : {}) };

    try {
      const batch = buildPeopleMemoryBatch({
        ...work.data,
        persons: peopleActive ? work.data.persons : [],
        difficulties: topicsActive ? work.data.difficulties : [],
      });
      const response = await repository.generatePeopleMemory({
        locale: options.locale,
        avatarFirstName: modality.avatarFirstName,
        persons: batch.persons,
        forgottenPeople: peopleActive ? work.data.forgottenPeople : [],
        messages: batch.messages,
        peopleEnabled: peopleActive,
        topicsEnabled: topicsActive,
        difficulties: batch.difficulties,
      });
      usage = addUsage(usage, response.providerMetadata.usage);
      const canSplit = attempt < PEOPLE_BATCH_MAX_ATTEMPTS && maxChars > PEOPLE_BATCH_MIN_CHARS;
      if (response.changes.incomplete && canSplit) {
        maxChars = Math.max(PEOPLE_BATCH_MIN_CHARS, Math.floor(maxChars / 2));
        continue;
      }
      const changes = toPeopleMemoryChangeSet(response.changes, batch, {
        avatarFirstName: modality.avatarFirstName,
        forgottenPeople: work.data.forgottenPeople,
        peopleActive,
        topicsActive,
      });
      const saved = await repository.saveOwnedPeopleMemoryWork(context, avatar.avatarId, {
        revision: work.data.revision,
        cursors: batch.cursors,
        changes,
      });
      // Przegrany CAS to równoległy postęp, edycja użytkownika albo wyłączenie:
      // kolejny krok odczyta nowy stan zamiast zapisywać przeterminowane zmiany.
      if (!saved.ok) return { ok: false };
      if (!saved.data) return { ok: true, ready: false, updated: false, ...(usage ? { usage } : {}) };
      const remaining = await repository.getOwnedPeopleMemoryWork(context, avatar.avatarId, {
        maxChars: PEOPLE_BATCH_DEFAULT_CHARS,
      });
      if (!remaining.ok) return { ok: false };
      const stillActive = (peopleMode && remaining.data.enabled) || (topicsMode && remaining.data.topicsEnabled);
      return {
        ok: true,
        ready: !stillActive || remaining.data.messages.length === 0,
        updated: true,
        ...(response.changes.incomplete ? { partial: true } : {}),
        ...(usage ? { usage } : {}),
      };
    } catch (error) {
      return error instanceof SessionSummaryError ? { ok: false, providerFailure: error.category } : { ok: false };
    }
  }
}

function addUsage(
  total: PeopleMemoryUsage | undefined,
  usage: { promptTokens?: number; completionTokens?: number } | undefined,
): PeopleMemoryUsage | undefined {
  if (!usage) return total;
  const inputUnits = (total?.inputUnits ?? 0) + (usage.promptTokens ?? 0);
  const outputUnits = (total?.outputUnits ?? 0) + (usage.completionTokens ?? 0);
  return { inputUnits, outputUnits };
}
