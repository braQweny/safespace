import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { FIELD, PILL_OUTLINE } from "@/components/ui/button-styles";
import type { DifficultyCard } from "@/lib/session-data/types";
import { cn } from "@/lib/utils";
import { getTopicMapCopy } from "./topic-map-copy";

interface DifficultyMergeFormProps {
  card: DifficultyCard;
  /** Pozostałe trudności tej perspektywy (bez tej karty) — cele scalenia. */
  otherCards: readonly DifficultyCard[];
  mutations: DifficultyMutations;
}

/** „Scal z innym tematem”: zwinięte, bo to rzadka korekta, a nie codzienna akcja. */
export default function DifficultyMergeForm({ card, otherCards, mutations }: DifficultyMergeFormProps) {
  const copy = getTopicMapCopy(useLocale());
  const [mergeTargetId, setMergeTargetId] = useState<string>(otherCards[0]?.id ?? "");
  const isMerging = mutations.mergingId === card.id;
  const mergeTarget = otherCards.find((entry) => entry.id === mergeTargetId) ?? null;

  if (otherCards.length === 0) {
    return null;
  }

  return (
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
          className={cn(PILL_OUTLINE, "mt-3")}
        >
          {isMerging ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {isMerging ? copy.merging : mergeTarget ? copy.mergeAction(mergeTarget.label) : copy.mergeSummary}
        </button>
      </div>
    </details>
  );
}
