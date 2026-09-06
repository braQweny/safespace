import { ChevronRight } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { formatDay } from "@/lib/i18n/format";
import type { DifficultyCard } from "@/lib/session-data/types";
import EffectChip from "./EffectChip";
import { getTopicMapCopy } from "./topic-map-copy";

interface TopicListProps {
  cards: DifficultyCard[];
  /** Wyspa hydratuje się z opóźnieniem; do tego czasu wiersze są wyłączone, nie nieme. */
  isInteractive: boolean;
  onOpen: (difficultyId: string) => void;
}

/** Deterministyczny id wiersza: po zamknięciu dialogu fokus wraca na tę trudność. */
export function getOpenDifficultyButtonId(difficultyId: string) {
  return `topic-card-open-${difficultyId}`;
}

/** Osoby, przy których trudność się pojawia: bez odrzuconych; niepewne bez wyróżnienia. */
export function listLinkedPersonNames(card: DifficultyCard) {
  return card.persons.filter((person) => person.state !== "rejected").map((person) => person.name);
}

/**
 * Cały wiersz jest przyciskiem: nazwa z oznaczeniem „mniej aktualne”, chip
 * ostatniej oceny, osoby, liczba rozmów i data ostatniej wzmianki. Żadnego
 * wpisu z karty — treść pokazuje dopiero otwarty dialog.
 */
export default function TopicList({ cards, isInteractive, onOpen }: TopicListProps) {
  const locale = useLocale();
  const copy = getTopicMapCopy(locale);

  return (
    <ol className="divide-line -mx-3 mt-1 divide-y">
      {cards.map((card) => {
        const names = listLinkedPersonNames(card);
        return (
          <li key={card.id}>
            <button
              type="button"
              id={getOpenDifficultyButtonId(card.id)}
              disabled={!isInteractive}
              onClick={() => {
                onOpen(card.id);
              }}
              className="text-ink hover:bg-surface-soft focus-visible:ring-brand-ring flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="sr-only">{copy.openCardSr(card.label)}</span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[15px] leading-6">
                  <span className={card.archivedAt ? "text-ink-muted font-semibold" : "font-semibold"}>
                    {card.label}
                  </span>
                  {card.archivedAt ? <span className="text-ink-muted text-[13px]"> · {copy.archivedBadge}</span> : null}
                  {names.length > 0 ? (
                    <span className="text-ink-muted text-[13px]"> · {copy.personsLine(names.join(", "))}</span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {card.currentState?.effect ? <EffectChip effect={card.currentState.effect} /> : null}
                  <span
                    title={copy.mentionsTitle}
                    className="bg-surface-soft text-ink-muted inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  >
                    {copy.mentions(card.mentionCount)}
                  </span>
                  {card.lastMentionedAt ? (
                    <span className="text-ink-muted text-xs">
                      {copy.lastMentioned(formatDay(locale, new Date(card.lastMentionedAt)))}
                    </span>
                  ) : null}
                  {card.hasNewEntriesSinceArchived ? (
                    <span className="text-brand-deep text-xs font-medium">{copy.newSinceArchived}</span>
                  ) : null}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="text-ink-muted h-4 w-4 shrink-0" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
