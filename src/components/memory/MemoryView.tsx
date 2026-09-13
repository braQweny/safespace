import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { useDifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useLocale } from "@/components/hooks/useLocale";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { usePersonMutations } from "@/components/hooks/usePersonMutations";
import { LocaleProvider } from "@/components/LocaleProvider";
import PeopleCardList, { getOpenPersonCardButtonId } from "@/components/people/PeopleCardList";
import PersonCardDialog from "@/components/people/PersonCardDialog";
import { getPeopleCardsCopy } from "@/components/people/people-cards-copy";
import DifficultyDialog from "@/components/topics/DifficultyDialog";
import PendingLinks, { listPendingLinks } from "@/components/topics/PendingLinks";
import TopicGraph from "@/components/topics/TopicGraph";
import TopicList, { getOpenDifficultyButtonId } from "@/components/topics/TopicList";
import { getTopicMapCopy } from "@/components/topics/topic-map-copy";
import {
  getServerTopicMapView,
  readTopicMapView,
  setTopicMapView,
  subscribeTopicMapView,
  type TopicMapView,
} from "@/components/topics/topic-map-view";
import { requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { DifficultyCard, PersonCard } from "@/lib/session-data/types";
import { isPeopleListSuccess } from "@/lib/session-flow/people-contract";
import { isTopicListSuccess } from "@/lib/session-flow/topic-map-contract";
import type { TopicGraphUnlinkedPerson } from "@/lib/topic-map/layout";
import { cn } from "@/lib/utils";
import { getMemoryViewCopy } from "./memory-view-copy";

const SETTINGS_HREF = "/account/security#memory";

const SEGMENT =
  "text-ink hover:bg-surface-soft focus-visible:ring-brand-ring aria-pressed:bg-brand-tint aria-pressed:text-brand-deep flex h-10 flex-1 items-center justify-center rounded-[10px] px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

const NOTE = "bg-surface-soft text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6";
const LINK =
  "text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2";

interface MemoryViewProps {
  locale: Locale;
  /** Zapisana perspektywa — karty są jej, a „porozmawiaj” startuje z nią. */
  avatar: SelectedModalityAvatar;
  /** Flagi funkcji: część wyłączona flagą nie renderuje się w ogóle. */
  peopleMemoryMode: boolean;
  topicMapMode: boolean;
  /** `null` = odczyt się nie udał (nigdy „brak kart”). */
  initialPersonCards: PersonCard[] | null;
  initialDifficultyCards: DifficultyCard[] | null;
  /** Preferencje konta: część wyłączona preferencją pokazuje zapisane karty i notę. */
  peopleMemoryEnabled: boolean;
  topicMapEnabled: boolean;
  /** Aktywna rozmowa tej samej perspektywy; z inną nie ma dokąd wracać z kartą. */
  resumeSessionId?: string | null;
  /** Podsumowanie, które awatar czyta przed rozmową; `null` = jeszcze nie powstało. */
  memoryPreview: string | null;
  /** Tylko do testów: otwarty dialog w pierwszym renderze. */
  initialSelectedPersonId?: string | null;
  initialSelectedDifficultyId?: string | null;
  /** Tylko do testów: wymuszony widok zamiast zapamiętanego wyboru. */
  forcedView?: TopicMapView | null;
}

/** Osoby z kart, których nie łączy z żadnym tematem nieodrzucona krawędź. */
export function listUnlinkedPeople(
  personCards: readonly PersonCard[],
  difficultyCards: readonly DifficultyCard[],
): TopicGraphUnlinkedPerson[] {
  const linked = new Set<string>();
  for (const card of difficultyCards) {
    for (const person of card.persons) {
      if (person.state !== "rejected") linked.add(person.personId);
    }
  }
  return personCards
    .filter((card) => !linked.has(card.id))
    .map((card) => ({ id: card.id, name: card.name, relation: card.relation }));
}

export default function MemoryView({ locale, ...props }: MemoryViewProps) {
  return (
    <LocaleProvider locale={locale}>
      <MemoryViewBody {...props} />
    </LocaleProvider>
  );
}

/**
 * Jedno miejsce na wszystko, co awatar pamięta z rozmów: osoby i tematy na
 * jednej mapie albo w jednej liście z dwiema grupami, pytanie „do
 * potwierdzenia” jako pierwsza rzecz, podsumowanie na dole. Dwa rodzaje kart
 * dzielą jeden natywny dialog, jedną pętlę przygotowania w tle i jedno
 * odświeżenie po niej.
 */
function MemoryViewBody({
  avatar,
  peopleMemoryMode,
  topicMapMode,
  initialPersonCards,
  initialDifficultyCards,
  peopleMemoryEnabled,
  topicMapEnabled,
  resumeSessionId = null,
  memoryPreview,
  initialSelectedPersonId = null,
  initialSelectedDifficultyId = null,
  forcedView = null,
}: Omit<MemoryViewProps, "locale">) {
  const locale = useLocale();
  const copy = getMemoryViewCopy(locale);
  const peopleCopy = getPeopleCardsCopy(locale);
  const topicCopy = getTopicMapCopy(locale);
  const isHydrated = useIsHydrated();
  // Serwer i hydratacja pokazują listę; zapamiętany wybór albo szerokość ekranu
  // wchodzą dopiero po hydratacji, bez rozjazdu znaczników.
  const storedView = useSyncExternalStore(subscribeTopicMapView, readTopicMapView, getServerTopicMapView);
  const view = forcedView ?? storedView;
  const [personCards, setPersonCards] = useState<PersonCard[] | null>(peopleMemoryMode ? initialPersonCards : []);
  const [difficultyCards, setDifficultyCards] = useState<DifficultyCard[] | null>(
    topicMapMode ? initialDifficultyCards : [],
  );
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialSelectedPersonId);
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string | null>(initialSelectedDifficultyId);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const requestedRef = useRef<{ kind: "person" | "difficulty"; id: string } | null>(
    initialSelectedPersonId
      ? { kind: "person", id: initialSelectedPersonId }
      : initialSelectedDifficultyId
        ? { kind: "difficulty", id: initialSelectedDifficultyId }
        : null,
  );

  const replacePerson = useCallback((card: PersonCard) => {
    setPersonCards((current) => (current ? current.map((entry) => (entry.id === card.id ? card : entry)) : [card]));
  }, []);
  const removePerson = useCallback((personId: string) => {
    setPersonCards((current) => (current ? current.filter((entry) => entry.id !== personId) : current));
  }, []);
  const replaceDifficulty = useCallback((card: DifficultyCard) => {
    setDifficultyCards((current) => (current ? current.map((entry) => (entry.id === card.id ? card : entry)) : [card]));
  }, []);
  const removeDifficulty = useCallback((difficultyId: string) => {
    setDifficultyCards((current) => (current ? current.filter((entry) => entry.id !== difficultyId) : current));
  }, []);

  function closeDialogAfterRemoval() {
    dialogRef.current?.close();
    setSelectedPersonId(null);
    setSelectedDifficultyId(null);
    document.getElementById("memory-view-title")?.focus({ preventScroll: true });
  }

  const personMutations = usePersonMutations({
    onUpdated: replacePerson,
    onForgotten: (personId) => {
      const name = personCards?.find((entry) => entry.id === personId)?.name ?? "";
      removePerson(personId);
      setNotice(peopleCopy.forgotten(name));
      closeDialogAfterRemoval();
    },
    onFactDeleted: (personId, card) => {
      if (card) {
        replacePerson(card);
        return;
      }
      const name = personCards?.find((entry) => entry.id === personId)?.name ?? "";
      removePerson(personId);
      setNotice(peopleCopy.forgotten(name));
      closeDialogAfterRemoval();
    },
    onError: (code) => {
      setNotice(peopleCopy.errors[code]);
    },
  });

  const difficultyMutations = useDifficultyMutations({
    onUpdated: replaceDifficulty,
    onDeleted: (difficultyId) => {
      const label = difficultyCards?.find((entry) => entry.id === difficultyId)?.label ?? "";
      removeDifficulty(difficultyId);
      setNotice(topicCopy.deleted(label));
      closeDialogAfterRemoval();
    },
    onEntryDeleted: (difficultyId, card) => {
      if (card) {
        replaceDifficulty(card);
        return;
      }
      const label = difficultyCards?.find((entry) => entry.id === difficultyId)?.label ?? "";
      removeDifficulty(difficultyId);
      setNotice(topicCopy.deleted(label));
      closeDialogAfterRemoval();
    },
    // Po scaleniu źródło znika, cel dostaje nową kartę, a dialog przeskakuje
    // na cel — użytkownik patrzy dalej na to, co właśnie połączył.
    onMerged: (sourceId, card) => {
      const sourceLabel = difficultyCards?.find((entry) => entry.id === sourceId)?.label ?? "";
      setDifficultyCards((current) =>
        current
          ? current.filter((entry) => entry.id !== sourceId).map((entry) => (entry.id === card.id ? card : entry))
          : [card],
      );
      setNotice(topicCopy.merged(sourceLabel, card.label));
      requestedRef.current = { kind: "difficulty", id: card.id };
      setSelectedDifficultyId(card.id);
    },
    onError: (code) => {
      setNotice(topicCopy.errors[code]);
    },
  });

  // Listy przyjeżdżają z serwera; po zakończeniu wspólnej partii w tle
  // odświeżamy obie jednym GET każda, żeby nikt nie patrzył na pusty widok.
  const refreshCards = useCallback(async () => {
    const avatarQuery = `avatar=${encodeURIComponent(avatar.avatarId)}`;
    const [people, topics] = await Promise.all([
      peopleMemoryMode ? requestApiJson(`/api/session/people?${avatarQuery}`) : null,
      topicMapMode ? requestApiJson(`/api/session/topics?${avatarQuery}`) : null,
    ]);
    if (people?.kind === "json" && isPeopleListSuccess(people.body)) setPersonCards(people.body.cards);
    if (topics?.kind === "json" && isTopicListSuccess(topics.body)) setDifficultyCards(topics.body.cards);
  }, [avatar.avatarId, peopleMemoryMode, topicMapMode]);
  const onCardsUpdated = useCallback(() => {
    void refreshCards();
  }, [refreshCards]);
  usePeopleMemoryPreparation(
    avatar,
    (peopleMemoryMode && peopleMemoryEnabled) || (topicMapMode && topicMapEnabled),
    onCardsUpdated,
  );

  const selectedPerson = selectedPersonId
    ? (personCards?.find((entry) => entry.id === selectedPersonId) ?? null)
    : null;
  const selectedDifficulty = selectedDifficultyId
    ? (difficultyCards?.find((entry) => entry.id === selectedDifficultyId) ?? null)
    : null;
  // Dialog otwiera się per karta; zmiany treści karty nie przeładowują go.
  const selectedCardId = selectedPerson?.id ?? selectedDifficulty?.id ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!selectedCardId || !dialog) return;

    dialog.showModal();
    dialog.focus();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [selectedCardId]);

  function openPerson(personId: string) {
    if (!personCards?.some((entry) => entry.id === personId)) return;
    setNotice(null);
    requestedRef.current = { kind: "person", id: personId };
    setSelectedDifficultyId(null);
    setSelectedPersonId(personId);
  }

  function openDifficulty(difficultyId: string) {
    setNotice(null);
    requestedRef.current = { kind: "difficulty", id: difficultyId };
    setSelectedPersonId(null);
    setSelectedDifficultyId(difficultyId);
  }

  // Panel znika z DOM razem z dialogiem, więc fokus oddajemy świadomie — na
  // wiersz (albo węzeł) tej samej karty, zanim React zdąży odmontować dialog.
  function handleClose() {
    const requested = requestedRef.current;
    dialogRef.current?.close();
    personMutations.cancelForget();
    personMutations.cancelDeleteFact();
    difficultyMutations.cancelDelete();
    difficultyMutations.cancelDeleteEntry();
    setSelectedPersonId(null);
    setSelectedDifficultyId(null);
    if (!requested) return;
    const buttonId =
      requested.kind === "person" ? getOpenPersonCardButtonId(requested.id) : getOpenDifficultyButtonId(requested.id);
    document.getElementById(buttonId)?.focus({ preventScroll: true });
  }

  const people = peopleMemoryMode ? (personCards ?? []) : [];
  const topics = topicMapMode ? (difficultyCards ?? []) : [];
  const pendingLinks = topicMapMode && topicMapEnabled ? listPendingLinks(topics) : [];
  const hasAnyCards = people.length > 0 || topics.length > 0;
  const readFailed = (peopleMemoryMode && personCards === null) || (topicMapMode && difficultyCards === null);
  const firstName = avatar.avatarFirstName;

  return (
    <section
      className="border-line-strong bg-surface shadow-card min-w-0 rounded-[20px] border p-5 sm:p-6"
      data-memory-view
    >
      <h2 id="memory-view-title" tabIndex={-1} className="sr-only">
        {copy.sectionTitle}
      </h2>

      {notice ? (
        <div className="bg-surface-soft text-ink-soft rounded-xl p-4 text-sm leading-6" role="status">
          {notice}
        </div>
      ) : null}

      {peopleMemoryMode && !peopleMemoryEnabled ? (
        <div className={cn(NOTE, !notice && "mt-0")} data-people-disabled>
          {people.length > 0 ? peopleCopy.disabledWithCards : peopleCopy.disabled}{" "}
          <a href={SETTINGS_HREF} className={LINK}>
            {peopleCopy.settingsLink}
          </a>
        </div>
      ) : null}

      {topicMapMode && !topicMapEnabled ? (
        <div className={cn(NOTE, !notice && (!peopleMemoryMode || peopleMemoryEnabled) && "mt-0")} data-topics-disabled>
          {topics.length > 0 ? topicCopy.disabledWithCards : topicCopy.disabled}{" "}
          <a href={SETTINGS_HREF} className={LINK}>
            {topicCopy.settingsLink}
          </a>
        </div>
      ) : null}

      {peopleMemoryMode && personCards === null ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-xl border p-4 text-sm leading-6">
          {peopleCopy.readFailed}
        </div>
      ) : null}

      {topicMapMode && difficultyCards === null ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-xl border p-4 text-sm leading-6">
          {topicCopy.readFailed}
        </div>
      ) : null}

      <PendingLinks links={pendingLinks} isInteractive={isHydrated} mutations={difficultyMutations} />

      {hasAnyCards ? (
        <>
          {/* Dwa równoważne widoki: mapa domyślnie od 768 px, lista poniżej; wybór zapamiętany. */}
          <fieldset className="m-0 mt-4 max-w-xs min-w-0 border-0 p-0">
            <legend className="sr-only">{topicCopy.viewLegend}</legend>
            <div className="border-line-strong flex gap-0.5 rounded-xl border p-0.5">
              <button
                type="button"
                aria-pressed={view === "graph"}
                disabled={!isHydrated}
                onClick={() => {
                  setTopicMapView("graph");
                }}
                className={SEGMENT}
              >
                {topicCopy.viewMap}
              </button>
              <button
                type="button"
                aria-pressed={view === "list"}
                disabled={!isHydrated}
                onClick={() => {
                  setTopicMapView("list");
                }}
                className={SEGMENT}
              >
                {topicCopy.viewList}
              </button>
            </div>
          </fieldset>
          <div className="mt-3">
            {view === "graph" ? (
              <TopicGraph
                cards={topics}
                unlinkedPeople={listUnlinkedPeople(people, topics)}
                isInteractive={isHydrated}
                onOpen={openDifficulty}
                onOpenPerson={peopleMemoryMode ? openPerson : undefined}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {people.length > 0 ? (
                  <div data-memory-group="people">
                    <div className="flex items-center gap-3">
                      <h3 className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">
                        {copy.peopleGroup(people.length)}
                      </h3>
                      <span aria-hidden="true" className="bg-line h-px flex-1" />
                    </div>
                    <PeopleCardList cards={people} isInteractive={isHydrated} onOpen={openPerson} />
                  </div>
                ) : null}
                {topics.length > 0 ? (
                  <div data-memory-group="topics">
                    <div className="flex items-center gap-3">
                      <h3 className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">
                        {copy.topicsGroup(topics.length)}
                      </h3>
                      <span aria-hidden="true" className="bg-line h-px flex-1" />
                    </div>
                    <TopicList cards={topics} isInteractive={isHydrated} onOpen={openDifficulty} />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : !readFailed ? (
        <p
          className={cn(
            "text-ink-muted text-sm leading-6",
            (notice !== null || !peopleMemoryEnabled || !topicMapEnabled) && "mt-4",
          )}
        >
          {copy.emptyAll(firstName)}
        </p>
      ) : null}

      {/* Podsumowanie, które awatar czyta przed rozmową: raz, na dole, zwinięte. */}
      <details className="bg-surface-soft mt-5 rounded-2xl p-4" data-memory-summary>
        <summary className="focus-visible:ring-brand-ring flex min-h-11 cursor-pointer list-none items-center gap-3 rounded focus:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="text-ink block text-[15px] leading-6 font-semibold">{copy.summaryTitle(firstName)}</span>
            <span className="text-ink-muted block text-[13px] leading-5">{copy.summaryNote}</span>
          </span>
          <ChevronDown aria-hidden="true" className="text-ink-muted h-4 w-4 shrink-0" />
        </summary>
        {memoryPreview ? (
          <p className="text-ink mt-3 font-serif text-[17px] leading-7 whitespace-pre-wrap">{memoryPreview}</p>
        ) : (
          <p className="text-ink-muted mt-3 text-sm leading-6">{copy.summaryEmpty}</p>
        )}
      </details>

      {selectedPerson || (selectedDifficulty && difficultyCards) ? (
        <dialog
          ref={dialogRef}
          aria-label={selectedPerson ? peopleCopy.dialogAria : topicCopy.dialogAria}
          tabIndex={-1}
          onCancel={(event) => {
            event.preventDefault();
            handleClose();
          }}
          className="border-line-strong bg-surface text-ink fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border p-0 backdrop:bg-black/50"
        >
          {selectedPerson ? (
            <PersonCardDialog
              card={selectedPerson}
              avatarFirstName={firstName}
              resumeSessionId={resumeSessionId}
              mutations={personMutations}
              onClose={handleClose}
            />
          ) : selectedDifficulty && difficultyCards ? (
            <DifficultyDialog
              card={selectedDifficulty}
              cards={difficultyCards}
              avatarFirstName={firstName}
              resumeSessionId={resumeSessionId}
              mutations={difficultyMutations}
              onClose={handleClose}
            />
          ) : null}
        </dialog>
      ) : null}
    </section>
  );
}
