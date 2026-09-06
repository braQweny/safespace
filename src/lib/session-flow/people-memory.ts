import { getValidAvatarChoice } from "@/lib/modalities";
import type { Locale } from "@/lib/i18n/locale";
import type { AvatarMemoryCursor } from "@/lib/session-data/avatar-memory";
import type { PeopleMemoryChangeSet, PeopleMemoryFactWrite, PeopleMemoryWork } from "@/lib/session-data/people-memory";
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
  ForgottenPerson,
  PeopleMemoryChanges,
  PeopleMemoryFactDraft,
  PeopleMemoryRefIndex,
  PeoplePromptPerson,
} from "@/lib/session-summary/people-memory-types";
import type { SessionSummaryConversationMessage } from "@/lib/session-summary/types";
import { isPeopleMemoryEnabled } from "./people-memory-mode";

// Przepełniona odpowiedź dzieli partię na pół; trzy próby to 16 000 → 8 000 →
// 4 000 znaków w jednym żądaniu, potem wynik jest przyjmowany jako częściowy.
const PEOPLE_BATCH_MAX_ATTEMPTS = 3;

export interface PeopleMemoryBatch {
  messages: SessionSummaryConversationMessage[];
  cursors: AvatarMemoryCursor[];
  persons: PeoplePromptPerson[];
  sessionIdByConversationIndex: ReadonlyMap<number, string>;
  personIdByRef: ReadonlyMap<number, string>;
  factIdByRef: ReadonlyMap<number, ReadonlyMap<number, string>>;
  refIndex: PeopleMemoryRefIndex;
}

/** Baza ogranicza partię; identyfikatory sesji i osób zostają poza promptem. */
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
  const factIdByRef = new Map<number, Map<number, string>>();
  const persons: PeoplePromptPerson[] = work.persons.map((person, personIndex) => {
    const ref = personIndex + 1;
    personIdByRef.set(ref, person.id);
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

  return {
    messages,
    cursors: [...cursors.values()],
    persons,
    sessionIdByConversationIndex,
    personIdByRef,
    factIdByRef,
    refIndex: {
      personRefs: new Set(personIdByRef.keys()),
      factRefsByPerson: new Map([...factIdByRef].map(([ref, ids]) => [ref, new Set(ids.keys())])),
      conversationCount: cursors.size,
    },
  };
}

interface ChangeSetOptions {
  avatarFirstName: string;
  forgottenPeople: readonly ForgottenPerson[];
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
  const toWrite = (fact: PeopleMemoryFactDraft): PeopleMemoryFactWrite | null => {
    const sourceSessionId = batch.sessionIdByConversationIndex.get(fact.conversationIndex);
    return sourceSessionId ? { kind: fact.kind, text: fact.text, sourceSessionId } : null;
  };
  const avatarName = normalizePersonName(options.avatarFirstName);

  const newPersons = changes.newPersons.flatMap((person) => {
    if (normalizePersonName(person.name) === avatarName) return [];
    if (isForgotten(person.name, person.relation, options.forgottenPeople)) return [];
    const facts = person.facts.map(toWrite).filter((fact): fact is PeopleMemoryFactWrite => fact !== null);
    if (facts.length === 0) return [];
    return [
      {
        name: person.name,
        relation: person.relation,
        relationSourceSessionId: person.relation ? facts[0].sourceSessionId : null,
        facts,
      },
    ];
  });

  const updates = changes.updates.flatMap((update) => {
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
    const mentionedIndexes = new Set([
      ...update.mentionedInConversations,
      ...update.addFacts.map((fact) => fact.conversationIndex),
      ...update.replaceFacts.map((fact) => fact.conversationIndex),
    ]);
    const mentionedSessionIds = [...mentionedIndexes]
      .sort((left, right) => left - right)
      .flatMap((index) => {
        const sessionId = batch.sessionIdByConversationIndex.get(index);
        return sessionId ? [sessionId] : [];
      });
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
  });

  return { newPersons, updates };
}

const dependencies = {
  getOwnedPeopleMemoryWork,
  saveOwnedPeopleMemoryWork,
  generatePeopleMemory,
  isPeopleMemoryEnabled,
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
 * Jeden trwały krok kart osób. Start rozmowy nigdy na niego nie czeka; awaria
 * zostawia kursory w miejscu, a przepełniona odpowiedź dzieli partię na pół.
 */
export async function prepareOwnedPeopleMemory(
  context: SessionDataContext,
  avatar: { avatarId: SessionAvatarId; modalityId: SessionModalityId },
  options: { locale: Locale },
  repository = dependencies,
): Promise<PreparePeopleMemoryResult> {
  if (!repository.isPeopleMemoryEnabled()) return { ok: true, ready: true, updated: false, skipped: "mode_off" };
  const modality = getValidAvatarChoice(avatar.modalityId, avatar.avatarId);
  if (!modality) return { ok: false };

  let maxChars = PEOPLE_BATCH_DEFAULT_CHARS;
  let usage: PeopleMemoryUsage | undefined;
  for (let attempt = 1; ; attempt += 1) {
    const work = await repository.getOwnedPeopleMemoryWork(context, avatar.avatarId, { maxChars });
    if (!work.ok) return { ok: false };
    if (!work.data.enabled) return { ok: true, ready: true, updated: false, skipped: "preference_off" };
    if (work.data.messages.length === 0) return { ok: true, ready: true, updated: false, ...(usage ? { usage } : {}) };

    try {
      const batch = buildPeopleMemoryBatch(work.data);
      const response = await repository.generatePeopleMemory({
        locale: options.locale,
        avatarFirstName: modality.avatarFirstName,
        persons: batch.persons,
        forgottenPeople: work.data.forgottenPeople,
        messages: batch.messages,
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
      return {
        ok: true,
        ready: !remaining.data.enabled || remaining.data.messages.length === 0,
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
