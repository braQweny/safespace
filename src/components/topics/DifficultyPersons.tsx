import { useState } from "react";
import InlineConfirm from "@/components/InlineConfirm";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { PILL_OUTLINE, PILL_QUIET_DANGER, PILL_SMALL_SIZE } from "@/components/ui/button-styles";
import type { DifficultyCard, DifficultyPersonLink } from "@/lib/session-data/types";
import { cn } from "@/lib/utils";
import { SECTION_TITLE } from "./difficulty-dialog-styles";
import { getTopicMapCopy } from "./topic-map-copy";

const UNLINK_HEADING_ID = "topic-card-unlink-heading";

interface DifficultyPersonsProps {
  card: DifficultyCard;
  mutations: DifficultyMutations;
}

/**
 * „Pojawia się przy”: osoby, przy których temat wraca, z decyzją użytkownika
 * przy każdym powiązaniu. Odłączenie potwierdzonej osoby pyta w miejscu.
 */
export default function DifficultyPersons({ card, mutations }: DifficultyPersonsProps) {
  const copy = getTopicMapCopy(useLocale());
  const [pendingUnlinkPersonId, setPendingUnlinkPersonId] = useState<string | null>(null);

  if (card.persons.length === 0) {
    return null;
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
            className={cn(PILL_OUTLINE, PILL_SMALL_SIZE)}
          >
            {copy.confirmLink}
          </button>
          <button
            type="button"
            disabled={isDeciding}
            onClick={() => {
              void mutations.decidePerson(card.id, person.personId, "rejected");
            }}
            className={cn(PILL_OUTLINE, PILL_SMALL_SIZE)}
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
          className={cn(PILL_OUTLINE, PILL_SMALL_SIZE)}
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
        className={cn(PILL_QUIET_DANGER, PILL_SMALL_SIZE)}
      >
        {copy.unlink}
      </button>
    );
  }

  return (
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
              <InlineConfirm
                variant="nested"
                headingId={UNLINK_HEADING_ID}
                title={copy.confirmUnlinkTitle}
                body={copy.confirmUnlinkBody}
                cancelLabel={copy.cancel}
                confirmLabel={copy.confirmUnlink}
                isPending={mutations.decidingPersonId === person.personId}
                onCancel={() => {
                  setPendingUnlinkPersonId(null);
                }}
                onConfirm={() => {
                  setPendingUnlinkPersonId(null);
                  void mutations.decidePerson(card.id, person.personId, "rejected");
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
