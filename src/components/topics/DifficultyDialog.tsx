import { useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import InlineConfirm from "@/components/InlineConfirm";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { useTimeZone } from "@/components/hooks/useTimeZone";
import { BLOCK_PRIMARY_FULL, PILL_OUTLINE, PILL_QUIET_DANGER } from "@/components/ui/button-styles";
import { formatDay } from "@/lib/i18n/format";
import type { DifficultyCard } from "@/lib/session-data/types";
import { cn } from "@/lib/utils";
import { SECTION_TITLE } from "./difficulty-dialog-styles";
import DifficultyEditForm from "./DifficultyEditForm";
import DifficultyEntryTimeline from "./DifficultyEntryTimeline";
import DifficultyMergeForm from "./DifficultyMergeForm";
import DifficultyPersons from "./DifficultyPersons";
import EffectChip from "./EffectChip";
import { getTopicMapCopy } from "./topic-map-copy";

export { findDifficultyByLabel } from "./DifficultyEditForm";
export { buildDifficultySections } from "./DifficultyEntryTimeline";

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

/** Trudność jedzie dalej samym id (`topic`), nigdy etykietą. */
export function buildTalkAboutTopicHref(difficultyId: string, resumeSessionId: string | null) {
  const topic = `topic=${encodeURIComponent(difficultyId)}`;
  return resumeSessionId
    ? `/dashboard/session?sessionId=${encodeURIComponent(resumeSessionId)}&${topic}`
    : `/dashboard?start=now&${topic}`;
}

/**
 * Karta tematu w natywnym dialogu: nagłówek z usunięciem, edycja nazwy i
 * notatki, stan, osoby, osie czasu wpisów, scalenie i jedna akcja główna —
 * rozmowa. Części z własnym stanem (edycja, osoby, wpisy, scalenie) żyją w
 * osobnych plikach obok.
 */
export default function DifficultyDialog({
  card,
  cards,
  avatarFirstName,
  resumeSessionId,
  mutations,
  onClose,
}: DifficultyDialogProps) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const copy = getTopicMapCopy(locale);
  const [isEditing, setIsEditing] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const otherCards = cards.filter((entry) => entry.id !== card.id);
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const isConfirmingDelete = mutations.pendingDeleteId === card.id;
  const isDeleting = mutations.deletingId === card.id;
  const isSavingCard = mutations.savingDifficultyId === card.id;
  const showsArchiveNudge = card.currentState?.effect === "resolved" && card.archivedAt === null;

  function handleCancelDelete() {
    mutations.cancelDelete();
    deleteButtonRef.current?.focus();
  }

  function startEditing() {
    setSavedNotice(false);
    setIsEditing(true);
  }

  function archiveNow() {
    void mutations.updateDifficulty(card.id, { label: card.label, userNote: card.userNote, archived: true });
  }

  const talkAboutHref = buildTalkAboutTopicHref(card.id, resumeSessionId);

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
            className={PILL_QUIET_DANGER}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {copy.delete}
          </button>
          <button type="button" onClick={onClose} className={PILL_OUTLINE}>
            <X aria-hidden="true" className="h-4 w-4" />
            {copy.close}
          </button>
        </div>
      </div>

      <p className="text-ink-muted mt-4 text-sm leading-6">{copy.ownAccountNote}</p>
      <p className="text-ink-muted mt-1 text-xs leading-5">
        {card.firstMentionedAt
          ? copy.firstMentioned(formatDay(locale, timeZone, new Date(card.firstMentionedAt)))
          : null}
        {card.firstMentionedAt ? " · " : null}
        {copy.mentions(card.mentionCount)}
      </p>
      {card.aliases.length > 0 ? (
        <p className="text-ink-muted mt-1 text-xs leading-5">
          {copy.aliasesLabel}: {card.aliases.map((alias) => alias.alias).join(", ")}
        </p>
      ) : null}

      {/* Escape przy otwartym potwierdzeniu cofa tylko je; kartę zamyka dopiero
          następne (`onCancel` dialogu w `MemoryView`). */}
      {isConfirmingDelete ? (
        <InlineConfirm
          headingId={DELETE_HEADING_ID}
          title={copy.confirmDeleteTitle}
          body={copy.confirmDeleteBody(avatarFirstName)}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirmDelete}
          isPending={isDeleting}
          pendingLabel={copy.deleting}
          showsPendingSpinner
          onCancel={handleCancelDelete}
          onConfirm={() => {
            void mutations.confirmDelete(card.id);
          }}
        />
      ) : null}

      {isEditing ? (
        <DifficultyEditForm
          card={card}
          cards={cards}
          avatarFirstName={avatarFirstName}
          mutations={mutations}
          onSaved={() => {
            setIsEditing(false);
            setSavedNotice(true);
          }}
          onCancel={() => {
            setIsEditing(false);
          }}
        />
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startEditing} className={PILL_OUTLINE}>
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
          <button type="button" disabled={isSavingCard} onClick={archiveNow} className={cn(PILL_OUTLINE, "mt-3")}>
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
              {formatDay(locale, timeZone, new Date(card.currentState.conversationAt))}
            </p>
          ) : null}
        </section>
      ) : null}

      <DifficultyPersons card={card} mutations={mutations} />

      <DifficultyEntryTimeline card={card} mutations={mutations} />

      <DifficultyMergeForm card={card} otherCards={otherCards} mutations={mutations} />

      {/* Jedna akcja główna: rozmowa, nie statyczna notatka „co robić”. */}
      <a href={talkAboutHref} className={cn(BLOCK_PRIMARY_FULL, "mt-6")}>
        {resumeSessionId ? copy.talkAboutResume : copy.talkAbout}
      </a>
    </div>
  );
}
