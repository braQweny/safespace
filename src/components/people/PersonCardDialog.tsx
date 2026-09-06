import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import type { PersonMutations } from "@/components/hooks/usePersonMutations";
import { useLocale } from "@/components/hooks/useLocale";
import { formatDay } from "@/lib/i18n/format";
import type { PersonCard, PersonFact } from "@/lib/session-data/types";
import { PEOPLE_LIMITS } from "@/lib/session-flow/people-contract";
import { PEOPLE_FACT_KINDS, type PeopleFactKind } from "@/lib/session-summary/people-memory-budget";
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

const PILL =
  "border-line-accent bg-surface text-ink hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const QUIET_DANGER =
  "text-ink-muted hover:bg-danger-soft hover:text-danger focus-visible:ring-danger-strong inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER =
  "bg-danger text-surface hover:bg-danger-strong focus-visible:ring-danger-strong disabled:bg-danger-line inline-flex h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed";
const FIELD =
  "border-line-strong bg-surface text-ink placeholder:text-ink-muted focus-visible:ring-brand-ring block w-full rounded-[14px] border px-4 py-3 text-base leading-relaxed focus:outline-none focus-visible:ring-2";

export function buildTalkAboutHref(personId: string, resumeSessionId: string | null) {
  const about = `about=${encodeURIComponent(personId)}`;
  return resumeSessionId
    ? `/dashboard/session?sessionId=${encodeURIComponent(resumeSessionId)}&${about}`
    : `/dashboard?start=now&${about}`;
}

function groupFacts(facts: readonly PersonFact[]) {
  const groups = new Map<PeopleFactKind, PersonFact[]>(PEOPLE_FACT_KINDS.map((kind) => [kind, []]));
  for (const fact of facts) groups.get(fact.kind)?.push(fact);
  return [...groups].filter(([, entries]) => entries.length > 0);
}

export default function PersonCardDialog({
  card,
  avatarFirstName,
  resumeSessionId,
  mutations,
  onClose,
}: PersonCardDialogProps) {
  const locale = useLocale();
  const copy = getPeopleCardsCopy(locale);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(card.name);
  const [draftRelation, setDraftRelation] = useState(card.relation ?? "");
  const [draftNote, setDraftNote] = useState(card.userNote);
  const [savedNotice, setSavedNotice] = useState(false);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [draftFact, setDraftFact] = useState("");
  const confirmForgetRef = useRef<HTMLDivElement | null>(null);
  const forgetButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmFactDeleteRef = useRef<HTMLDivElement | null>(null);
  const isConfirmingForget = mutations.pendingForgetId === card.id;
  const isForgetting = mutations.forgettingId === card.id;
  const isSavingPerson = mutations.savingPersonId === card.id;

  // Blok potwierdzenia pojawia się poza fokusem — bez przeniesienia fokusu
  // czytnik ekranu nie dowiedziałby się, że coś wymaga decyzji.
  useEffect(() => {
    if (isConfirmingForget) confirmForgetRef.current?.focus();
  }, [isConfirmingForget]);

  useEffect(() => {
    if (mutations.pendingDeleteFactId) confirmFactDeleteRef.current?.focus();
  }, [mutations.pendingDeleteFactId]);

  function handleCancelForget() {
    mutations.cancelForget();
    forgetButtonRef.current?.focus();
  }

  function stopEscape(event: KeyboardEvent<HTMLElement>, cancel: () => void) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
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
            className={QUIET_DANGER}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {copy.forget}
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

      {isConfirmingForget ? (
        <div
          ref={confirmForgetRef}
          role="group"
          aria-labelledby={FORGET_HEADING_ID}
          tabIndex={-1}
          onKeyDown={(event) => {
            stopEscape(event, handleCancelForget);
          }}
          className="border-line-accent bg-surface text-ink-soft mt-4 rounded-xl border p-4 text-sm leading-6 focus:outline-none"
        >
          <p id={FORGET_HEADING_ID} className="font-semibold">
            {copy.confirmForgetTitle}
          </p>
          <p className="mt-1">{copy.confirmForgetBody(avatarFirstName, card.name)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handleCancelForget} className={PILL}>
              {copy.cancel}
            </button>
            <button
              type="button"
              disabled={isForgetting}
              onClick={() => {
                void mutations.confirmForget(card.id);
              }}
              className={DANGER}
            >
              {isForgetting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isForgetting ? copy.forgetting : copy.confirmForget}
            </button>
          </div>
        </div>
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
            <button type="submit" disabled={isSavingPerson || draftName.trim().length === 0} className={PILL}>
              {isSavingPerson ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {isSavingPerson ? copy.saving : copy.save}
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
          <p className="text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase">{copy.fields.note}</p>
          <p className="mt-1 whitespace-pre-wrap">{card.userNote}</p>
        </div>
      ) : null}

      {card.facts.length === 0 ? (
        <p className="text-ink-muted mt-4 text-sm leading-6">{copy.noFacts}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {groupFacts(card.facts).map(([kind, facts]) => (
            <section key={kind}>
              <h3 className="text-brand-deep text-xs font-semibold tracking-[0.08em] uppercase">{copy.kinds[kind]}</h3>
              <ul className="mt-2 space-y-3">
                {facts.map((fact) => (
                  <li key={fact.id} className="border-line rounded-xl border p-3">
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
                            className={PILL}
                          >
                            {copy.factSave}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFactId(null);
                            }}
                            className={PILL}
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
                                    {formatDay(locale, new Date(source.conversationAt))}
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
                          <div
                            ref={confirmFactDeleteRef}
                            role="group"
                            aria-labelledby={FACT_DELETE_HEADING_ID}
                            tabIndex={-1}
                            onKeyDown={(event) => {
                              stopEscape(event, mutations.cancelDeleteFact);
                            }}
                            className="border-line-accent bg-surface-soft text-ink-soft mt-2 rounded-xl border p-3 text-sm leading-6 focus:outline-none"
                          >
                            <p id={FACT_DELETE_HEADING_ID} className="font-semibold">
                              {copy.confirmFactDeleteTitle}
                            </p>
                            <p className="mt-1">{copy.confirmFactDeleteBody}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="button" onClick={mutations.cancelDeleteFact} className={PILL}>
                                {copy.cancel}
                              </button>
                              <button
                                type="button"
                                disabled={mutations.savingFactId === fact.id}
                                onClick={() => {
                                  void mutations.confirmDeleteFact(card.id, fact.id);
                                }}
                                className={DANGER}
                              >
                                {copy.confirmFactDelete}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setDraftFact(fact.text);
                                setEditingFactId(fact.id);
                              }}
                              className={cn(PILL, "h-9 px-3 text-xs")}
                            >
                              {copy.factEdit}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                mutations.requestDeleteFact(fact.id);
                              }}
                              className={cn(QUIET_DANGER, "h-9 px-3 text-xs")}
                            >
                              {copy.factDelete}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

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
