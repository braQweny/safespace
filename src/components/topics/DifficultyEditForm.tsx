import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { FIELD, PILL_OUTLINE } from "@/components/ui/button-styles";
import type { DifficultyCard } from "@/lib/session-data/types";
import { TOPIC_LIMITS } from "@/lib/session-flow/topic-map-contract";
import { normalizeDifficultyLabel } from "@/lib/session-summary/topic-map-budget";
import { cn } from "@/lib/utils";
import { getTopicMapCopy } from "./topic-map-copy";

interface DifficultyEditFormProps {
  card: DifficultyCard;
  /** Wszystkie trudności tej perspektywy — cel „Scal z…” po zajętej nazwie. */
  cards: readonly DifficultyCard[];
  avatarFirstName: string;
  mutations: DifficultyMutations;
  /** Zapis się udał: karta wraca do widoku z potwierdzeniem. */
  onSaved: () => void;
  onCancel: () => void;
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

/**
 * Nazwa, notatka i „mniej aktualne”. Montowany na czas edycji, więc każde
 * otwarcie zaczyna od tego, co jest teraz na karcie. Zajęta nazwa nie kończy
 * się błędem, tylko propozycją scalenia z tematem, który już ją nosi.
 */
export default function DifficultyEditForm({
  card,
  cards,
  avatarFirstName,
  mutations,
  onSaved,
  onCancel,
}: DifficultyEditFormProps) {
  const copy = getTopicMapCopy(useLocale());
  const [draftLabel, setDraftLabel] = useState(card.label);
  const [draftNote, setDraftNote] = useState(card.userNote);
  const [draftArchived, setDraftArchived] = useState(card.archivedAt !== null);
  const [duplicateOf, setDuplicateOf] = useState<DifficultyCard | null>(null);
  const [duplicateUnknown, setDuplicateUnknown] = useState(false);
  const isSavingCard = mutations.savingDifficultyId === card.id;
  const isMerging = mutations.mergingId === card.id;

  async function submitCard() {
    setDuplicateOf(null);
    setDuplicateUnknown(false);
    const code = await mutations.updateDifficulty(card.id, {
      label: draftLabel.trim(),
      userNote: draftNote.trim(),
      archived: draftArchived,
    });
    if (code === null) {
      onSaved();
      return;
    }
    if (code === "duplicate_difficulty_label") {
      const target = findDifficultyByLabel(draftLabel, cards, card.id);
      setDuplicateOf(target);
      setDuplicateUnknown(target === null);
    }
  }

  return (
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
              className={cn(PILL_OUTLINE, "mt-2")}
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
        <button type="submit" disabled={isSavingCard || draftLabel.trim().length === 0} className={PILL_OUTLINE}>
          {isSavingCard ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {isSavingCard ? copy.saving : copy.save}
        </button>
        <button type="button" onClick={onCancel} className={PILL_OUTLINE}>
          {copy.cancel}
        </button>
      </div>
    </form>
  );
}
