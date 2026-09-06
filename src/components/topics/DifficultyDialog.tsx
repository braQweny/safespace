import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { formatDay } from "@/lib/i18n/format";
import type { DifficultyCard, DifficultyEntry, DifficultyPersonLink } from "@/lib/session-data/types";
import { TOPIC_LIMITS } from "@/lib/session-flow/topic-map-contract";
import { normalizeDifficultyLabel, type DifficultyEntryKind } from "@/lib/session-summary/topic-map-budget";
import { cn } from "@/lib/utils";
import EffectChip from "./EffectChip";
import { getTopicMapCopy } from "./topic-map-copy";

interface DifficultyDialogProps {
  card: DifficultyCard;
  /** Wszystkie trudności tej perspektywy (z tą kartą włącznie) — cele scalenia. */
  cards: readonly DifficultyCard[];
  avatarFirstName: string;
  /** Aktywna rozmowa tej samej perspektywy — wtedy „porozmawiaj” wraca do niej. */
  resumeSessionId: string | null;
  mutations: DifficultyMutations;
  onClose: () => void;
}

const DELETE_HEADING_ID = "topic-card-delete-heading";
const ENTRY_DELETE_HEADING_ID = "topic-card-entry-delete-heading";
const UNLINK_HEADING_ID = "topic-card-unlink-heading";
const PARENT_PREVIEW_MAX_CHARS = 80;

const PILL =
  "border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const SMALL_PILL = "h-9 px-3 text-xs";
const QUIET_DANGER =
  "text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:ring-danger-strong inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER =
  "bg-danger text-surface hover:bg-danger-strong focus-visible:ring-danger-strong disabled:bg-danger-line inline-flex h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed";
const FIELD =
  "border-line-strong bg-surface text-ink placeholder:text-ink-muted focus-visible:ring-brand-ring block w-full rounded-[14px] border px-4 py-3 text-base leading-relaxed focus:outline-none focus-visible:ring-2";
const SECTION_TITLE = "text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase";

/** Trudność jedzie dalej samym id (`topic`), nigdy etykietą. */
export function buildTalkAboutTopicHref(difficultyId: string, resumeSessionId: string | null) {
  const topic = `topic=${encodeURIComponent(difficultyId)}`;
  return resumeSessionId
    ? `/dashboard/session?sessionId=${encodeURIComponent(resumeSessionId)}&${topic}`
    : `/dashboard?start=now&${topic}`;
}

/**
 * Cel dla „Scal z…” po odrzuconej nazwie: ta sama normalizacja co w bazie,
 * po etykiecie i po innych nazwach. `null`, gdy lista jest nieaktualna.
 */
export function findDifficultyByLabel(label: string, cards: readonly DifficultyCard[], excludeId: string) {
  const normalized = normalizeDifficultyLabel(label);
  if (normalized.length === 0) return null;
  return (
    cards.find(
      (card) =>
        card.id !== excludeId &&
        (normalizeDifficultyLabel(card.label) === normalized ||
          card.aliases.some((alias) => normalizeDifficultyLabel(alias.alias) === normalized)),
    ) ?? null
  );
}

interface EntrySection {
  key: string;
  title: string;
  entries: DifficultyEntry[];
  /** Oś czasu: chronologicznie po dacie rozmowy, z rodzajem przy każdym wpisie. */
  timeline: boolean;
}

const DESCRIPTIVE_KINDS: readonly DifficultyEntryKind[] = ["how", "coping"];
const STRATEGY_KINDS: readonly DifficultyEntryKind[] = ["suggested", "agreed", "outcome"];

function earliestConversationTime(entry: DifficultyEntry) {
  const times = entry.sources.map((source) => Date.parse(source.conversationAt)).filter(Number.isFinite);
  return times.length > 0 ? Math.min(...times) : Date.parse(entry.createdAt);
}

function byConversationTime(a: DifficultyEntry, b: DifficultyEntry) {
  return earliestConversationTime(a) - earliestConversationTime(b);
}

/**
 * „Jak to wygląda” i „jak sobie radzisz” po rodzaju; „jak jest teraz” jako
 * oś czasu ocen; propozycje, postanowienia i rezultaty razem, po dacie rozmowy,
 * żeby feedback stał po tym, na co odpowiada.
 */
export function buildDifficultySections(
  entries: readonly DifficultyEntry[],
  copy: Pick<ReturnType<typeof getTopicMapCopy>, "kinds" | "updatesTitle" | "timelineTitle">,
): EntrySection[] {
  const sections: EntrySection[] = [];
  for (const kind of DESCRIPTIVE_KINDS) {
    const group = entries.filter((entry) => entry.kind === kind);
    if (group.length > 0) sections.push({ key: kind, title: copy.kinds[kind], entries: group, timeline: false });
  }
  const updates = entries.filter((entry) => entry.kind === "update").sort(byConversationTime);
  if (updates.length > 0) sections.push({ key: "updates", title: copy.updatesTitle, entries: updates, timeline: true });
  const strategies = entries.filter((entry) => STRATEGY_KINDS.includes(entry.kind)).sort(byConversationTime);
  if (strategies.length > 0) {
    sections.push({ key: "timeline", title: copy.timelineTitle, entries: strategies, timeline: true });
  }
  return sections;
}

function EntryList({ ordered, children }: { ordered: boolean; children: ReactNode }) {
  return ordered ? <ol className="mt-2 space-y-3">{children}</ol> : <ul className="mt-2 space-y-3">{children}</ul>;
}

function previewText(text: string) {
  const chars = Array.from(text);
  return chars.length > PARENT_PREVIEW_MAX_CHARS
    ? `${chars.slice(0, PARENT_PREVIEW_MAX_CHARS).join("").trimEnd()}…`
    : text;
}

export default function DifficultyDialog({
  card,
  cards,
  avatarFirstName,
  resumeSessionId,
  mutations,
  onClose,
}: DifficultyDialogProps) {
  const locale = useLocale();
  const copy = getTopicMapCopy(locale);
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(card.label);
  const [draftNote, setDraftNote] = useState(card.userNote);
  const [draftArchived, setDraftArchived] = useState(card.archivedAt !== null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState<DifficultyCard | null>(null);
  const [duplicateUnknown, setDuplicateUnknown] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [draftEntry, setDraftEntry] = useState("");
  const [pendingUnlinkPersonId, setPendingUnlinkPersonId] = useState<string | null>(null);
  const otherCards = cards.filter((entry) => entry.id !== card.id);
  const [mergeTargetId, setMergeTargetId] = useState<string>(otherCards[0]?.id ?? "");
  const confirmDeleteRef = useRef<HTMLDivElement | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmEntryDeleteRef = useRef<HTMLDivElement | null>(null);
  const confirmUnlinkRef = useRef<HTMLDivElement | null>(null);
  const isConfirmingDelete = mutations.pendingDeleteId === card.id;
  const isDeleting = mutations.deletingId === card.id;
  const isSavingCard = mutations.savingDifficultyId === card.id;
  const isMerging = mutations.mergingId === card.id;
  const personById = new Map(card.persons.map((person) => [person.personId, person]));
  const entryById = new Map(card.entries.map((entry) => [entry.id, entry]));
  const showsArchiveNudge = card.currentState?.effect === "resolved" && card.archivedAt === null;

  // Blok potwierdzenia pojawia się poza fokusem — bez przeniesienia fokusu
  // czytnik ekranu nie dowiedziałby się, że coś wymaga decyzji.
  useEffect(() => {
    if (isConfirmingDelete) confirmDeleteRef.current?.focus();
  }, [isConfirmingDelete]);

  useEffect(() => {
    if (mutations.pendingDeleteEntryId) confirmEntryDeleteRef.current?.focus();
  }, [mutations.pendingDeleteEntryId]);

  useEffect(() => {
    if (pendingUnlinkPersonId) confirmUnlinkRef.current?.focus();
  }, [pendingUnlinkPersonId]);

  function handleCancelDelete() {
    mutations.cancelDelete();
    deleteButtonRef.current?.focus();
  }

  function stopEscape(event: KeyboardEvent<HTMLElement>, cancel: () => void) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }

  function startEditing() {
    setDraftLabel(card.label);
    setDraftNote(card.userNote);
    setDraftArchived(card.archivedAt !== null);
    setSavedNotice(false);
    setDuplicateOf(null);
    setDuplicateUnknown(false);
    setIsEditing(true);
  }

  async function submitCard() {
    setDuplicateOf(null);
    setDuplicateUnknown(false);
    const code = await mutations.updateDifficulty(card.id, {
      label: draftLabel.trim(),
      userNote: draftNote.trim(),
      archived: draftArchived,
    });
    if (code === null) {
      setIsEditing(false);
      setSavedNotice(true);
      return;
    }
    if (code === "duplicate_difficulty_label") {
      const target = findDifficultyByLabel(draftLabel, cards, card.id);
      setDuplicateOf(target);
      setDuplicateUnknown(target === null);
    }
  }

  async function submitEntry(entryId: string) {
    const saved = await mutations.updateEntry(card.id, entryId, draftEntry.trim());
    if (saved) setEditingEntryId(null);
  }

  function archiveNow() {
    void mutations.updateDifficulty(card.id, { label: card.label, userNote: card.userNote, archived: true });
  }

  function renderPersonActions(person: DifficultyPersonLink) {
    const isDeciding = mutations.decidingPersonId === person.personId;
    if (person.state === "suggested") {
      return (
        <>
          <button
            type="button"
            disabled={isDeciding}
            onClick={() => {
              void mutations.decidePerson(card.id, person.personId, "confirmed");
            }}
            className={cn(PILL, SMALL_PILL)}
          >
            {copy.confirmLink}
          </button>
          <button
            type="button"
            disabled={isDeciding}
            onClick={() => {
              void mutations.decidePerson(card.id, person.personId, "rejected");
            }}
            className={cn(PILL, SMALL_PILL)}
          >
            {copy.rejectLink}
          </button>
        </>
      );
    }
    if (person.state === "rejected") {
      return (
        <button
          type="button"
          disabled={isDeciding}
          onClick={() => {
            void mutations.decidePerson(card.id, person.personId, "confirmed");
          }}
          className={cn(PILL, SMALL_PILL)}
        >
          {copy.relink}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={isDeciding}
        onClick={() => {
          setPendingUnlinkPersonId(person.personId);
        }}
        className={cn(QUIET_DANGER, SMALL_PILL)}
      >
        {copy.unlink}
      </button>
    );
  }

  const talkAboutHref = buildTalkAboutTopicHref(card.id, resumeSessionId);
  const mergeTarget = otherCards.find((entry) => entry.id === mergeTargetId) ?? null;

  return (
    <div className="bg-surface rounded-2xl p-4 sm:p-6">
      <div className="border-line bg-surface sticky top-0 z-10 -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6">
        <h2 className="text-ink font-serif text-xl leading-snug font-medium">
          {card.label}
          {card.archivedAt ? (
            <span className="text-ink-muted text-base font-normal"> · {copy.archivedBadge}</span>
          ) : null}
        </h2>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-2">
          <button
            ref={deleteButtonRef}
            type="button"
            disabled={isDeleting}
            onClick={() => {
              mutations.requestDelete(card.id);
            }}
            className={QUIET_DANGER}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {copy.delete}
          </button>
          <button type="button" onClick={onClose} className={PILL}>
            <X aria-hidden="true" className="h-4 w-4" />
            {copy.close}
          </button>
        </div>
      </div>

      <p className="text-ink-muted mt-4 text-sm leading-6">{copy.ownAccountNote}</p>
      <p className="text-ink-muted mt-1 text-xs leading-5">
        {card.firstMentionedAt ? copy.firstMentioned(formatDay(locale, new Date(card.firstMentionedAt))) : null}
        {card.firstMentionedAt ? " · " : null}
        {copy.mentions(card.mentionCount)}
      </p>
      {card.aliases.length > 0 ? (
        <p className="text-ink-muted mt-1 text-xs leading-5">
          {copy.aliasesLabel}: {card.aliases.map((alias) => alias.alias).join(", ")}
        </p>
      ) : null}

      {isConfirmingDelete ? (
        <div
          ref={confirmDeleteRef}
          role="group"
          aria-labelledby={DELETE_HEADING_ID}
          tabIndex={-1}
          onKeyDown={(event) => {
            stopEscape(event, handleCancelDelete);
          }}
          className="border-line-accent bg-surface text-ink-soft mt-4 rounded-xl border p-4 text-sm leading-6 focus:outline-none"
        >
          <p id={DELETE_HEADING_ID} className="font-semibold">
            {copy.confirmDeleteTitle}
          </p>
          <p className="mt-1">{copy.confirmDeleteBody(avatarFirstName)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handleCancelDelete} className={PILL}>
              {copy.cancel}
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                void mutations.confirmDelete(card.id);
              }}
              className={DANGER}
            >
              {isDeleting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isDeleting ? copy.deleting : copy.confirmDelete}
            </button>
          </div>
        </div>
      ) : null}

      {isEditing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitCard();
          }}
          className="bg-surface-soft mt-4 space-y-3 rounded-2xl p-4"
        >
          <div>
            <label htmlFor="topic-card-label" className="text-ink block text-sm font-medium">
              {copy.fields.label}
            </label>
            <input
              id="topic-card-label"
              value={draftLabel}
              required
              maxLength={TOPIC_LIMITS.label}
              onChange={(event) => {
                setDraftLabel(event.target.value);
              }}
              className={cn(FIELD, "mt-1")}
            />
          </div>
          {duplicateOf || duplicateUnknown ? (
            <div
              role="alert"
              className="border-line-accent bg-surface text-ink-soft rounded-xl border p-3 text-sm leading-6"
            >
              <p>{duplicateOf ? copy.duplicateOffer(duplicateOf.label) : copy.errors.duplicate_difficulty_label}</p>
              {duplicateOf ? (
                <button
                  type="button"
                  disabled={isMerging}
                  onClick={() => {
                    void mutations.merge(card.id, duplicateOf.id);
                  }}
                  className={cn(PILL, "mt-2")}
                >
                  {isMerging ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                  {isMerging ? copy.merging : copy.mergeAction(duplicateOf.label)}
                </button>
              ) : null}
            </div>
          ) : null}
          <div>
            <label htmlFor="topic-card-note" className="text-ink block text-sm font-medium">
              {copy.fields.note}
            </label>
            <textarea
              id="topic-card-note"
              value={draftNote}
              maxLength={TOPIC_LIMITS.userNote}
              rows={3}
              onChange={(event) => {
                setDraftNote(event.target.value);
              }}
              className={cn(FIELD, "mt-1 resize-none")}
            />
            <p className="text-ink-muted mt-1 text-xs">{copy.fields.hint(TOPIC_LIMITS.userNote)}</p>
          </div>
          <label className="text-ink flex items-start gap-2 text-sm leading-6">
            <input
              type="checkbox"
              checked={draftArchived}
              onChange={(event) => {
                setDraftArchived(event.target.checked);
              }}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span>{copy.fields.archived}</span>
          </label>
          <p className="text-ink-muted text-xs leading-5">{copy.lockedNote(avatarFirstName)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isSavingCard || draftLabel.trim().length === 0} className={PILL}>
              {isSavingCard ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isSavingCard ? copy.saving : copy.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
              }}
              className={PILL}
            >
              {copy.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startEditing} className={PILL}>
            <Pencil aria-hidden="true" className="h-4 w-4" />
            {copy.edit}
          </button>
          {savedNotice ? (
            <span role="status" className="text-ink-muted text-sm">
              {copy.saved}
            </span>
          ) : null}
        </div>
      )}

      {card.userNote && !isEditing ? (
        <div className="bg-brand-tint text-ink-soft mt-4 rounded-2xl p-4 text-sm leading-6">
          <p className={SECTION_TITLE}>{copy.fields.note}</p>
          <p className="mt-1 whitespace-pre-wrap">{card.userNote}</p>
        </div>
      ) : null}

      {showsArchiveNudge ? (
        <div className="bg-surface-soft text-ink-soft mt-4 rounded-2xl p-4 text-sm leading-6" data-topic-archive-nudge>
          <p className="text-ink font-semibold">{copy.archiveNudgeTitle}</p>
          <p className="mt-1">{copy.archiveNudgeBody}</p>
          <button type="button" disabled={isSavingCard} onClick={archiveNow} className={cn(PILL, "mt-3")}>
            {copy.archiveNudgeAction}
          </button>
        </div>
      ) : null}

      {card.currentState ? (
        <section className="mt-4" data-topic-current-state>
          <h3 className={SECTION_TITLE}>{copy.currentStateTitle}</h3>
          <p className="text-ink mt-2 flex flex-wrap items-center gap-2 text-[15px] leading-6">
            {card.currentState.effect ? <EffectChip effect={card.currentState.effect} /> : null}
            <span>{card.currentState.text}</span>
          </p>
          {card.currentState.conversationAt ? (
            <p className="text-ink-muted mt-1 text-xs leading-5">
              {formatDay(locale, new Date(card.currentState.conversationAt))}
            </p>
          ) : null}
        </section>
      ) : null}

      {card.persons.length > 0 ? (
        <section className="mt-4" data-topic-persons>
          <h3 className={SECTION_TITLE}>{copy.personsTitle}</h3>
          <ul className="mt-2 space-y-2">
            {card.persons.map((person) => (
              <li key={person.personId} className="border-line rounded-xl border p-3 text-sm leading-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-ink">
                    <span className="font-semibold">{person.name}</span>
                    {person.relation ? <span className="text-ink-muted"> · {person.relation}</span> : null}
                    {person.state !== "confirmed" ? (
                      <span className="text-ink-muted text-xs"> · {copy.personStates[person.state]}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 gap-2">{renderPersonActions(person)}</span>
                </div>
                {pendingUnlinkPersonId === person.personId ? (
                  <div
                    ref={confirmUnlinkRef}
                    role="group"
                    aria-labelledby={UNLINK_HEADING_ID}
                    tabIndex={-1}
                    onKeyDown={(event) => {
                      stopEscape(event, () => {
                        setPendingUnlinkPersonId(null);
                      });
                    }}
                    className="border-line-accent bg-surface-soft text-ink-soft mt-2 rounded-xl border p-3 text-sm leading-6 focus:outline-none"
                  >
                    <p id={UNLINK_HEADING_ID} className="font-semibold">
                      {copy.confirmUnlinkTitle}
                    </p>
                    <p className="mt-1">{copy.confirmUnlinkBody}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingUnlinkPersonId(null);
                        }}
                        className={PILL}
                      >
                        {copy.cancel}
                      </button>
                      <button
                        type="button"
                        disabled={mutations.decidingPersonId === person.personId}
                        onClick={() => {
                          setPendingUnlinkPersonId(null);
                          void mutations.decidePerson(card.id, person.personId, "rejected");
                        }}
                        className={DANGER}
                      >
                        {copy.confirmUnlink}
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {card.entries.length === 0 ? (
        <p className="text-ink-muted mt-4 text-sm leading-6">{copy.noEntries}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {buildDifficultySections(card.entries, copy).map((section) => (
            <section key={section.key}>
              <h3 className={SECTION_TITLE}>{section.title}</h3>
              {/* Osie czasu są uporządkowane, więc dostają listę numerowaną. */}
              <EntryList ordered={section.timeline}>
                {section.entries.map((entry) => {
                  const person = entry.personId ? personById.get(entry.personId) : undefined;
                  const parent = entry.parentEntryId ? entryById.get(entry.parentEntryId) : undefined;
                  return (
                    <li key={entry.id} className="border-line rounded-xl border p-3">
                      {section.timeline && section.key === "timeline" ? (
                        <p className="text-ink-muted mb-1 text-xs font-semibold">{copy.kinds[entry.kind]}</p>
                      ) : null}
                      {editingEntryId === entry.id ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void submitEntry(entry.id);
                          }}
                          className="space-y-2"
                        >
                          <label htmlFor={`topic-entry-${entry.id}`} className="sr-only">
                            {copy.entryEdit}
                          </label>
                          <textarea
                            id={`topic-entry-${entry.id}`}
                            value={draftEntry}
                            required
                            maxLength={TOPIC_LIMITS.entry}
                            rows={2}
                            onChange={(event) => {
                              setDraftEntry(event.target.value);
                            }}
                            className={cn(FIELD, "resize-none")}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={mutations.savingEntryId === entry.id || draftEntry.trim().length === 0}
                              className={PILL}
                            >
                              {copy.entrySave}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEntryId(null);
                              }}
                              className={PILL}
                            >
                              {copy.cancel}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className="text-ink flex flex-wrap items-center gap-2 text-[15px] leading-6">
                            {entry.effect ? <EffectChip effect={entry.effect} /> : null}
                            <span>{entry.text}</span>
                          </p>
                          {person || parent ? (
                            <p className="text-ink-muted mt-1 text-xs leading-5">
                              {person ? <span>{copy.withPerson(person.name)}</span> : null}
                              {person && parent ? " · " : null}
                              {parent ? (
                                <span>
                                  {copy.inReplyTo} „{previewText(parent.text)}”
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                          <p className="text-ink-muted mt-1 text-xs leading-5">
                            {entry.sources.length > 0 ? (
                              <>
                                {copy.provenance(entry.sources.length)}{" "}
                                {entry.sources.map((source, index) => (
                                  <span key={source.sessionId}>
                                    {index > 0 ? ", " : null}
                                    <a
                                      href={`/dashboard?session=${encodeURIComponent(source.sessionId)}`}
                                      className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded underline underline-offset-4 focus:outline-none focus-visible:ring-2"
                                    >
                                      {formatDay(locale, new Date(source.conversationAt))}
                                    </a>
                                  </span>
                                ))}
                              </>
                            ) : (
                              copy.provenanceUnknown
                            )}
                            {entry.userEdited ? ` · ${copy.editedByYou}` : null}
                          </p>
                          {mutations.pendingDeleteEntryId === entry.id ? (
                            <div
                              ref={confirmEntryDeleteRef}
                              role="group"
                              aria-labelledby={ENTRY_DELETE_HEADING_ID}
                              tabIndex={-1}
                              onKeyDown={(event) => {
                                stopEscape(event, mutations.cancelDeleteEntry);
                              }}
                              className="border-line-accent bg-surface-soft text-ink-soft mt-2 rounded-xl border p-3 text-sm leading-6 focus:outline-none"
                            >
                              <p id={ENTRY_DELETE_HEADING_ID} className="font-semibold">
                                {copy.confirmEntryDeleteTitle}
                              </p>
                              <p className="mt-1">{copy.confirmEntryDeleteBody}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={mutations.cancelDeleteEntry} className={PILL}>
                                  {copy.cancel}
                                </button>
                                <button
                                  type="button"
                                  disabled={mutations.savingEntryId === entry.id}
                                  onClick={() => {
                                    void mutations.confirmDeleteEntry(card.id, entry.id);
                                  }}
                                  className={DANGER}
                                >
                                  {copy.confirmEntryDelete}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftEntry(entry.text);
                                  setEditingEntryId(entry.id);
                                }}
                                className={cn(PILL, SMALL_PILL)}
                              >
                                {copy.entryEdit}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  mutations.requestDeleteEntry(entry.id);
                                }}
                                className={cn(QUIET_DANGER, SMALL_PILL)}
                              >
                                {copy.entryDelete}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </EntryList>
            </section>
          ))}
        </div>
      )}

      {otherCards.length > 0 ? (
        <details className="mt-5" data-topic-merge>
          <summary className="text-ink-muted hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2">
            {copy.mergeSummary}
          </summary>
          <div className="bg-surface-soft mt-3 rounded-2xl p-4">
            <p className="text-ink-muted text-sm leading-6">{copy.mergeBody}</p>
            <label htmlFor="topic-merge-target" className="text-ink mt-3 block text-sm font-medium">
              {copy.mergeSelectLabel}
            </label>
            <select
              id="topic-merge-target"
              value={mergeTargetId}
              onChange={(event) => {
                setMergeTargetId(event.target.value);
              }}
              className={cn(FIELD, "mt-1")}
            >
              {otherCards.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isMerging || !mergeTarget}
              onClick={() => {
                if (mergeTarget) void mutations.merge(card.id, mergeTarget.id);
              }}
              className={cn(PILL, "mt-3")}
            >
              {isMerging ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isMerging ? copy.merging : mergeTarget ? copy.mergeAction(mergeTarget.label) : copy.mergeSummary}
            </button>
          </div>
        </details>
      ) : null}

      {/* Jedna akcja główna: rozmowa, nie statyczna notatka „co robić”. */}
      <a
        href={talkAboutHref}
        className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-[14px] px-5 py-3 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
      >
        {resumeSessionId ? copy.talkAboutResume : copy.talkAbout}
      </a>
    </div>
  );
}
