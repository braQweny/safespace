import { Loader2 } from "lucide-react";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import type { DifficultyCard, DifficultyPersonLink } from "@/lib/session-data/types";
import { getTopicMapCopy } from "./topic-map-copy";

interface PendingLink {
  card: DifficultyCard;
  person: DifficultyPersonLink;
}

/** Krawędzie oznaczone przez model jako niepewne, bez decyzji użytkownika. */
export function listPendingLinks(cards: readonly DifficultyCard[]): PendingLink[] {
  return cards.flatMap((card) =>
    card.persons
      .filter((person) => person.state === "suggested" && !person.userDecided)
      .map((person) => ({ card, person })),
  );
}

const PILL =
  "border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Pasek „Do potwierdzenia”: jedyne, co mapa prosi potwierdzić, to niepewne
 * powiązanie trudności z osobą. Reszta jest automatyczna z korektą w dialogu.
 */
export default function PendingLinks({
  links,
  isInteractive,
  mutations,
}: {
  links: PendingLink[];
  isInteractive: boolean;
  mutations: DifficultyMutations;
}) {
  const copy = getTopicMapCopy(useLocale());
  if (links.length === 0) return null;

  return (
    <section
      aria-labelledby="topic-pending-title"
      className="border-line-accent bg-surface mt-4 rounded-2xl border p-4"
      data-topic-pending
    >
      <h3 id="topic-pending-title" className="text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase">
        {copy.pendingTitle}
      </h3>
      <ul className="mt-2 space-y-2">
        {links.map(({ card, person }) => {
          const isDeciding = mutations.decidingPersonId === person.personId;
          return (
            <li
              key={`${card.id}:${person.personId}`}
              className="flex flex-wrap items-center justify-between gap-2 text-sm leading-6"
            >
              <span className="text-ink">{copy.pendingQuestion(card.label, person.name)}</span>
              <span className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={!isInteractive || isDeciding}
                  onClick={() => {
                    void mutations.decidePerson(card.id, person.personId, "confirmed");
                  }}
                  className={PILL}
                >
                  {isDeciding ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
                  {copy.confirmLink}
                </button>
                <button
                  type="button"
                  disabled={!isInteractive || isDeciding}
                  onClick={() => {
                    void mutations.decidePerson(card.id, person.personId, "rejected");
                  }}
                  className={PILL}
                >
                  {copy.rejectLink}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
