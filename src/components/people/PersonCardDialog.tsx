import { useRef, useState, type ReactNode } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import InlineConfirm from "@/components/InlineConfirm";
import type { PersonMutations } from "@/components/hooks/usePersonMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { useTimeZone } from "@/components/hooks/useTimeZone";
import {
  BLOCK_PRIMARY_FULL,
  FIELD,
  PILL_OUTLINE,
  PILL_QUIET_DANGER,
  PILL_SMALL_SIZE,
} from "@/components/ui/button-styles";
import { formatDay } from "@/lib/i18n/format";
import type { PersonCard, PersonFact } from "@/lib/session-data/types";
import { PEOPLE_LIMITS } from "@/lib/session-flow/people-contract";
import {
  PEOPLE_FACT_KINDS,
  isPeopleTimelineKind,
  type PeopleFactKind,
} from "@/lib/session-summary/people-memory-budget";
import { cn } from "@/lib/utils";
import { getPeopleCardsCopy } from "./people-cards-copy";

interface PersonCardDialogProps {
  card: PersonCard;
  avatarFirstName: string;
  /** Aktywna rozmowa tej samej perspektywy — wtedy „porozmawiaj” wraca do niej. */
  resumeSessionId: string | null;
  mutations: PersonMutations;
  onClose: () => void;
}

const FORGET_HEADING_ID = "people-card-forget-heading";
const FACT_DELETE_HEADING_ID = "people-card-fact-delete-heading";

export function buildTalkAboutHref(personId: string, resumeSessionId: string | null) {
  const about = `about=${encodeURIComponent(personId)}`;
  return resumeSessionId
    ? `/dashboard/session?sessionId=${encodeURIComponent(resumeSessionId)}&${about}`
    : `/dashboard?start=now&${about}`;
}

interface FactSection {
  key: string;
  title: string;
  facts: PersonFact[];
  /** Próby i rezultaty: jedna chronologiczna oś, z rodzajem przy każdym wpisie. */
  timeline: boolean;
}

function earliestConversationTime(fact: PersonFact) {
  const times = fact.sources.map((source) => Date.parse(source.conversationAt)).filter(Number.isFinite);
  return times.length > 0 ? Math.min(...times) : Date.parse(fact.createdAt);
}

/** Zwykłe rodzaje grupowane po rodzaju; próby i rezultaty razem, po dacie rozmowy. */
export function buildFactSections(
  facts: readonly PersonFact[],
  kinds: Readonly<Record<PeopleFactKind, string>>,
  timelineTitle: string,
): FactSection[] {
  const groups = new Map<PeopleFactKind, PersonFact[]>(PEOPLE_FACT_KINDS.map((kind) => [kind, []]));
  const timeline: PersonFact[] = [];
  for (const fact of facts) {
    if (isPeopleTimelineKind(fact.kind)) timeline.push(fact);
    else groups.get(fact.kind)?.push(fact);
  }
  const sections: FactSection[] = [...groups]
    .filter(([, entries]) => entries.length > 0)
    .map(([kind, entries]) => ({ key: kind, title: kinds[kind], facts: entries, timeline: false }));
  if (timeline.length > 0) {
    sections.push({
      key: "timeline",
      title: timelineTitle,
      facts: [...timeline].sort((a, b) => earliestConversationTime(a) - earliestConversationTime(b)),
      timeline: true,
    });
  }
  return sections;
}

function FactList({ ordered, children }: { ordered: boolean; children: ReactNode }) {
  return ordered ? <ol className="mt-2 space-y-3">{children}</ol> : <ul className="mt-2 space-y-3">{children}</ul>;
}

export default function PersonCardDialog({
  card,
  avatarFirstName,
  resumeSessionId,
  mutations,
  onClose,
}: PersonCardDialogProps) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const copy = getPeopleCardsCopy(locale);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(card.name);
  const [draftRelation, setDraftRelation] = useState(card.relation ?? "");
  const [draftNote, setDraftNote] = useState(card.userNote);
  const [savedNotice, setSavedNotice] = useState(false);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [draftFact, setDraftFact] = useState("");
  const forgetButtonRef = useRef<HTMLButtonElement | null>(null);
  const isConfirmingForget = mutations.pendingForgetId === card.id;
  const isForgetting = mutations.forgettingId === card.id;
  const isSavingPerson = mutations.savingPersonId === card.id;

  function handleCancelForget() {
    mutations.cancelForget();
    forgetButtonRef.current?.focus();
  }

  function startEditing() {
    setDraftName(card.name);
    setDraftRelation(card.relation ?? "");
    setDraftNote(card.userNote);
    setSavedNotice(false);
    setIsEditing(true);
  }

  async function submitPerson() {
    const saved = await mutations.updatePerson(card.id, {
      displayName: draftName.trim(),
      relation: draftRelation.trim() ? draftRelation.trim() : null,
      userNote: draftNote.trim(),
    });
    if (saved) {
      setIsEditing(false);
      setSavedNotice(true);
    }
  }

  async function submitFact(factId: string) {
    const saved = await mutations.updateFact(card.id, factId, draftFact.trim());
    if (saved) setEditingFactId(null);
  }

  const talkAboutHref = buildTalkAboutHref(card.id, resumeSessionId);

  return (
    <div className="bg-surface rounded-2xl p-4 sm:p-6">
      <div className="border-line bg-surface sticky top-0 z-10 -mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6">
        <h2 className="text-ink font-serif text-xl leading-snug font-medium">
          {card.name}
          <span className="text-ink-muted text-base font-normal"> · {card.relation ?? copy.relationFallback}</span>
        </h2>
        <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-2">
          <button
            ref={forgetButtonRef}
            type="button"
            disabled={isForgetting}
            onClick={() => {
              mutations.requestForget(card.id);
            }}
            className={PILL_QUIET_DANGER}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {copy.forget}
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

      {/* Escape przy otwartym potwierdzeniu cofa tylko je; kartę zamyka dopiero
          następne (`onCancel` dialogu w `MemoryView`). */}
      {isConfirmingForget ? (
        <InlineConfirm
          headingId={FORGET_HEADING_ID}
          title={copy.confirmForgetTitle}
          body={copy.confirmForgetBody(avatarFirstName, card.name)}
          cancelLabel={copy.cancel}
          confirmLabel={copy.confirmForget}
          isPending={isForgetting}
          pendingLabel={copy.forgetting}
          showsPendingSpinner
          onCancel={handleCancelForget}
          onConfirm={() => {
            void mutations.confirmForget(card.id);
          }}
        />
      ) : null}

      {isEditing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitPerson();
          }}
          className="bg-surface-soft mt-4 space-y-3 rounded-2xl p-4"
        >
          <div>
            <label htmlFor="people-card-name" className="text-ink block text-sm font-medium">
              {copy.fields.name}
            </label>
            <input
              id="people-card-name"
              value={draftName}
              required
              maxLength={PEOPLE_LIMITS.displayName}
              onChange={(event) => {
                setDraftName(event.target.value);
              }}
              className={cn(FIELD, "mt-1")}
            />
          </div>
          <div>
            <label htmlFor="people-card-relation" className="text-ink block text-sm font-medium">
              {copy.fields.relation}
            </label>
            <input
              id="people-card-relation"
              value={draftRelation}
              maxLength={PEOPLE_LIMITS.relation}
              onChange={(event) => {
                setDraftRelation(event.target.value);
              }}
              className={cn(FIELD, "mt-1")}
            />
          </div>
          <div>
            <label htmlFor="people-card-note" className="text-ink block text-sm font-medium">
              {copy.fields.note}
            </label>
            <textarea
              id="people-card-note"
              value={draftNote}
              maxLength={PEOPLE_LIMITS.userNote}
              rows={3}
              onChange={(event) => {
                setDraftNote(event.target.value);
              }}
              className={cn(FIELD, "mt-1 resize-none")}
            />
            <p className="text-ink-muted mt-1 text-xs">{copy.fields.hint(PEOPLE_LIMITS.userNote)}</p>
          </div>
          <p className="text-ink-muted text-xs leading-5">{copy.lockedNote(avatarFirstName)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isSavingPerson || draftName.trim().length === 0} className={PILL_OUTLINE}>
              {isSavingPerson ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isSavingPerson ? copy.saving : copy.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
              }}
              className={PILL_OUTLINE}
            >
              {copy.cancel}
            </button>
          </div>
        </form>
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
          <p className="text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase">{copy.fields.note}</p>
          <p className="mt-1 whitespace-pre-wrap">{card.userNote}</p>
        </div>
      ) : null}

      {card.facts.length === 0 ? (
        <p className="text-ink-muted mt-4 text-sm leading-6">{copy.noFacts}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {buildFactSections(card.facts, copy.kinds, copy.timelineTitle).map((section) => (
            <section key={section.key}>
              <h3 className="text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase">{section.title}</h3>
              {/* Oś czasu jest uporządkowana, więc dostaje listę numerowaną. */}
              <FactList ordered={section.timeline}>
                {section.facts.map((fact) => (
                  <li key={fact.id} className="border-line rounded-xl border p-3">
                    {section.timeline ? (
                      <p className="text-ink-muted mb-1 text-xs font-semibold">{copy.kinds[fact.kind]}</p>
                    ) : null}
                    {editingFactId === fact.id ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitFact(fact.id);
                        }}
                        className="space-y-2"
                      >
                        <label htmlFor={`people-fact-${fact.id}`} className="sr-only">
                          {copy.factEdit}
                        </label>
                        <textarea
                          id={`people-fact-${fact.id}`}
                          value={draftFact}
                          required
                          maxLength={PEOPLE_LIMITS.fact}
                          rows={2}
                          onChange={(event) => {
                            setDraftFact(event.target.value);
                          }}
                          className={cn(FIELD, "resize-none")}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={mutations.savingFactId === fact.id || draftFact.trim().length === 0}
                            className={PILL_OUTLINE}
                          >
                            {copy.factSave}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFactId(null);
                            }}
                            className={PILL_OUTLINE}
                          >
                            {copy.cancel}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="text-ink text-[15px] leading-6">{fact.text}</p>
                        <p className="text-ink-muted mt-1 text-xs leading-5">
                          {fact.sources.length > 0 ? (
                            <>
                              {copy.provenance(fact.sources.length)}{" "}
                              {fact.sources.map((source, index) => (
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
                          {fact.userEdited ? ` · ${copy.editedByYou}` : null}
                        </p>
                        {mutations.pendingDeleteFactId === fact.id ? (
                          <InlineConfirm
                            variant="nested"
                            headingId={FACT_DELETE_HEADING_ID}
                            title={copy.confirmFactDeleteTitle}
                            body={copy.confirmFactDeleteBody}
                            cancelLabel={copy.cancel}
                            confirmLabel={copy.confirmFactDelete}
                            isPending={mutations.savingFactId === fact.id}
                            onCancel={mutations.cancelDeleteFact}
                            onConfirm={() => {
                              void mutations.confirmDeleteFact(card.id, fact.id);
                            }}
                          />
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDraftFact(fact.text);
                                setEditingFactId(fact.id);
                              }}
                              className={cn(PILL_OUTLINE, PILL_SMALL_SIZE)}
                            >
                              {copy.factEdit}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                mutations.requestDeleteFact(fact.id);
                              }}
                              className={cn(PILL_QUIET_DANGER, PILL_SMALL_SIZE)}
                            >
                              {copy.factDelete}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </FactList>
            </section>
          ))}
        </div>
      )}

      {/* Jedna akcja główna: rozmowa, nie statyczna notatka „co robić”. */}
      <a href={talkAboutHref} className={cn(BLOCK_PRIMARY_FULL, "mt-6")}>
        {resumeSessionId ? copy.talkAboutResume : copy.talkAbout}
      </a>
    </div>
  );
}
