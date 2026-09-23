import { useState, type ReactNode } from "react";
import InlineConfirm from "@/components/InlineConfirm";
import type { DifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { useTimeZone } from "@/components/hooks/useTimeZone";
import { FIELD, PILL_OUTLINE, PILL_QUIET_DANGER, PILL_SMALL_SIZE } from "@/components/ui/button-styles";
import { formatDay } from "@/lib/i18n/format";
import type { DifficultyCard, DifficultyEntry } from "@/lib/session-data/types";
import { TOPIC_LIMITS } from "@/lib/session-flow/topic-map-contract";
import type { DifficultyEntryKind } from "@/lib/session-summary/topic-map-budget";
import { cn } from "@/lib/utils";
import { SECTION_TITLE } from "./difficulty-dialog-styles";
import EffectChip from "./EffectChip";
import { getTopicMapCopy } from "./topic-map-copy";

const ENTRY_DELETE_HEADING_ID = "topic-card-entry-delete-heading";
const PARENT_PREVIEW_MAX_CHARS = 80;

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

interface DifficultyEntryTimelineProps {
  card: DifficultyCard;
  mutations: DifficultyMutations;
}

/**
 * Wpisy tematu w sekcjach i na osiach czasu, każdy z pochodzeniem (daty
 * rozmów) i własną korektą: poprawka tekstu albo usunięcie po pytaniu w miejscu.
 */
export default function DifficultyEntryTimeline({ card, mutations }: DifficultyEntryTimelineProps) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const copy = getTopicMapCopy(locale);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [draftEntry, setDraftEntry] = useState("");
  const personById = new Map(card.persons.map((person) => [person.personId, person]));
  const entryById = new Map(card.entries.map((entry) => [entry.id, entry]));

  async function submitEntry(entryId: string) {
    const saved = await mutations.updateEntry(card.id, entryId, draftEntry.trim());
    if (saved) setEditingEntryId(null);
  }

  if (card.entries.length === 0) {
    return <p className="text-ink-muted mt-4 text-sm leading-6">{copy.noEntries}</p>;
  }

  return (
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
                          className={PILL_OUTLINE}
                        >
                          {copy.entrySave}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEntryId(null);
                          }}
                          className={PILL_OUTLINE}
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
                                  {formatDay(locale, timeZone, new Date(source.conversationAt))}
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
                        <InlineConfirm
                          variant="nested"
                          headingId={ENTRY_DELETE_HEADING_ID}
                          title={copy.confirmEntryDeleteTitle}
                          body={copy.confirmEntryDeleteBody}
                          cancelLabel={copy.cancel}
                          confirmLabel={copy.confirmEntryDelete}
                          isPending={mutations.savingEntryId === entry.id}
                          onCancel={mutations.cancelDeleteEntry}
                          onConfirm={() => {
                            void mutations.confirmDeleteEntry(card.id, entry.id);
                          }}
                        />
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDraftEntry(entry.text);
                              setEditingEntryId(entry.id);
                            }}
                            className={cn(PILL_OUTLINE, PILL_SMALL_SIZE)}
                          >
                            {copy.entryEdit}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              mutations.requestDeleteEntry(entry.id);
                            }}
                            className={cn(PILL_QUIET_DANGER, PILL_SMALL_SIZE)}
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
  );
}
