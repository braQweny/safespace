import { ChevronRight } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { formatDay } from "@/lib/i18n/format";
import type { PersonCard } from "@/lib/session-data/types";
import { getPeopleCardsCopy } from "./people-cards-copy";

interface PeopleCardListProps {
  cards: PersonCard[];
  /** Wyspa hydratuje się z opóźnieniem; do tego czasu wiersze są wyłączone, nie nieme. */
  isInteractive: boolean;
  onOpen: (personId: string) => void;
}

/** Deterministyczny id wiersza: po zamknięciu dialogu fokus wraca na tę kartę. */
export function getOpenPersonCardButtonId(personId: string) {
  return `people-card-open-${personId}`;
}

/**
 * Cały wiersz jest przyciskiem: imię z relacją, liczba rozmów i data ostatniej
 * wzmianki. Żadnego wpisu z karty — treść pokazuje dopiero otwarty dialog.
 */
export default function PeopleCardList({ cards, isInteractive, onOpen }: PeopleCardListProps) {
  const locale = useLocale();
  const copy = getPeopleCardsCopy(locale);

  return (
    <ol className="divide-line -mx-3 mt-1 divide-y">
      {cards.map((card) => (
        <li key={card.id}>
          <button
            type="button"
            id={getOpenPersonCardButtonId(card.id)}
            disabled={!isInteractive}
            onClick={() => {
              onOpen(card.id);
            }}
            className="text-ink hover:bg-surface-soft focus-visible:ring-brand-ring flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="sr-only">{copy.openCardSr(card.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[15px] leading-6">
                <span className="font-semibold">{card.name}</span>
                <span className="text-ink-muted text-[13px]"> · {card.relation ?? copy.relationFallback}</span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
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
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="text-ink-muted h-4 w-4 shrink-0" />
          </button>
        </li>
      ))}
    </ol>
  );
}
