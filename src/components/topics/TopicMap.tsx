import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDifficultyMutations } from "@/components/hooks/useDifficultyMutations";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useLocale } from "@/components/hooks/useLocale";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { LocaleProvider } from "@/components/LocaleProvider";
import { requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { DifficultyCard } from "@/lib/session-data/types";
import { isTopicListSuccess } from "@/lib/session-flow/topic-map-contract";
import { cn } from "@/lib/utils";
import DifficultyDialog from "./DifficultyDialog";
import PendingLinks, { listPendingLinks } from "./PendingLinks";
import TopicGraph from "./TopicGraph";
import TopicList, { getOpenDifficultyButtonId } from "./TopicList";
import { getTopicMapCopy } from "./topic-map-copy";
import {
  getServerTopicMapView,
  readTopicMapView,
  setTopicMapView,
  subscribeTopicMapView,
  type TopicMapView,
} from "./topic-map-view";

const SEGMENT =
  "text-ink hover:bg-surface-soft focus-visible:ring-brand-ring aria-pressed:bg-brand-tint aria-pressed:text-brand-deep flex h-10 flex-1 items-center justify-center rounded-[10px] px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50";

interface TopicMapProps {
  locale: Locale;
  /** Zapisana perspektywa — mapa jest jej, a „porozmawiaj” startuje z nią. */
  avatar: SelectedModalityAvatar;
  /** `null` = odczyt się nie udał (nigdy „brak trudności”). */
  initialCards: DifficultyCard[] | null;
  topicMapEnabled: boolean;
  /** Aktywna rozmowa tej samej perspektywy; z inną nie ma dokąd wracać z kartą. */
  resumeSessionId?: string | null;
  /** Liczba kart osób tej perspektywy (zdanie o osobach bez tematów); `null` = karty osób wyłączone. */
  peopleCardCount?: number | null;
  className?: string;
  /** Tylko do testów: otwarty dialog w pierwszym renderze. */
  initialSelectedDifficultyId?: string | null;
  /** Tylko do testów: wymuszony widok zamiast zapamiętanego wyboru. */
  forcedView?: TopicMapView | null;
}

export default function TopicMap({ locale, ...props }: TopicMapProps) {
  return (
    <LocaleProvider locale={locale}>
      <TopicMapView {...props} />
    </LocaleProvider>
  );
}

function TopicMapView({
  avatar,
  initialCards,
  topicMapEnabled,
  resumeSessionId = null,
  peopleCardCount = null,
  className,
  initialSelectedDifficultyId = null,
  forcedView = null,
}: Omit<TopicMapProps, "locale">) {
  const copy = getTopicMapCopy(useLocale());
  const isHydrated = useIsHydrated();
  // Serwer i hydratacja pokazują listę; zapamiętany wybór albo szerokość ekranu
  // wchodzą dopiero po hydratacji, bez rozjazdu znaczników.
  const storedView = useSyncExternalStore(subscribeTopicMapView, readTopicMapView, getServerTopicMapView);
  const view = forcedView ?? storedView;
  const [cards, setCards] = useState<DifficultyCard[] | null>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedDifficultyId);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const requestedIdRef = useRef<string | null>(initialSelectedDifficultyId);

  const replaceCard = useCallback((card: DifficultyCard) => {
    setCards((current) => (current ? current.map((entry) => (entry.id === card.id ? card : entry)) : [card]));
  }, []);

  const removeCard = useCallback((difficultyId: string) => {
    setCards((current) => (current ? current.filter((entry) => entry.id !== difficultyId) : current));
  }, []);

  function closeDialogAfterRemoval() {
    dialogRef.current?.close();
    setSelectedId(null);
    document.getElementById("topic-map-title")?.focus({ preventScroll: true });
  }

  const mutations = useDifficultyMutations({
    onUpdated: replaceCard,
    onDeleted: (difficultyId) => {
      const label = cards?.find((entry) => entry.id === difficultyId)?.label ?? "";
      removeCard(difficultyId);
      setNotice(copy.deleted(label));
      closeDialogAfterRemoval();
    },
    onEntryDeleted: (difficultyId, card) => {
      if (card) {
        replaceCard(card);
        return;
      }
      const label = cards?.find((entry) => entry.id === difficultyId)?.label ?? "";
      removeCard(difficultyId);
      setNotice(copy.deleted(label));
      closeDialogAfterRemoval();
    },
    // Po scaleniu źródło znika, cel dostaje nową kartę, a dialog przeskakuje
    // na cel — użytkownik patrzy dalej na to, co właśnie połączył.
    onMerged: (sourceId, card) => {
      const sourceLabel = cards?.find((entry) => entry.id === sourceId)?.label ?? "";
      setCards((current) =>
        current
          ? current.filter((entry) => entry.id !== sourceId).map((entry) => (entry.id === card.id ? card : entry))
          : [card],
      );
      setNotice(copy.merged(sourceLabel, card.label));
      requestedIdRef.current = card.id;
      setSelectedId(card.id);
    },
    onError: (code) => {
      setNotice(copy.errors[code]);
    },
  });

  // Lista przyjeżdża z serwera; po zakończeniu przygotowania w tle (wspólna
  // partia z kartami osób) odświeżamy ją jednym GET.
  const refreshCards = useCallback(async () => {
    const result = await requestApiJson(`/api/session/topics?avatar=${encodeURIComponent(avatar.avatarId)}`);
    if (result.kind === "json" && isTopicListSuccess(result.body)) setCards(result.body.cards);
  }, [avatar.avatarId]);
  const onCardsUpdated = useCallback(() => {
    void refreshCards();
  }, [refreshCards]);
  usePeopleMemoryPreparation(avatar, topicMapEnabled, onCardsUpdated);

  const selectedCard = selectedId ? (cards?.find((entry) => entry.id === selectedId) ?? null) : null;
  // Dialog otwiera się per karta; zmiany treści karty nie przeładowują go.
  const selectedCardId = selectedCard?.id ?? null;

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

  function handleOpen(difficultyId: string) {
    setNotice(null);
    requestedIdRef.current = difficultyId;
    setSelectedId(difficultyId);
  }

  // Panel znika z DOM razem z dialogiem, więc fokus oddajemy świadomie — na
  // wiersz tej samej karty, zanim React zdąży odmontować dialog.
  function handleClose() {
    const difficultyId = selectedId ?? requestedIdRef.current;
    dialogRef.current?.close();
    mutations.cancelDelete();
    mutations.cancelDeleteEntry();
    setSelectedId(null);
    if (difficultyId) {
      document.getElementById(getOpenDifficultyButtonId(difficultyId))?.focus({ preventScroll: true });
    }
  }

  const pendingLinks = cards && topicMapEnabled ? listPendingLinks(cards) : [];

  return (
    <section
      className={cn(
        "border-line-strong bg-surface shadow-card mt-8 min-w-0 rounded-[20px] border p-5 sm:p-6",
        className,
      )}
      data-topic-map
    >
      <h2 id="topic-map-title" tabIndex={-1} className="text-ink font-serif text-2xl leading-tight font-medium">
        {copy.title}
      </h2>
      <p className="text-ink-muted mt-1 text-sm leading-6">{copy.intro(avatar.avatarFirstName)}</p>

      {notice ? (
        <div className="bg-surface-soft text-ink-soft mt-4 rounded-xl p-4 text-sm leading-6" role="status">
          {notice}
        </div>
      ) : null}

      {!topicMapEnabled ? (
        <div className="bg-surface-soft text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">
          {cards && cards.length > 0 ? copy.disabledWithCards : copy.disabled}{" "}
          <a
            href="/account/security#topic-map"
            className="text-brand hover:text-brand-deep focus-visible:ring-brand-ring rounded font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2"
          >
            {copy.settingsLink}
          </a>
        </div>
      ) : null}

      {cards === null ? (
        <div className="border-danger-line bg-danger-soft text-danger mt-4 rounded-xl border p-4 text-sm leading-6">
          {copy.readFailed}
        </div>
      ) : cards.length === 0 && topicMapEnabled ? (
        <div className="bg-surface-soft text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">
          {copy.empty(avatar.avatarFirstName)}
        </div>
      ) : null}

      <PendingLinks links={pendingLinks} isInteractive={isHydrated} mutations={mutations} />

      {cards && cards.length > 0 ? (
        <>
          {/* Dwa równoważne widoki: mapa domyślnie od 768 px, lista poniżej; wybór zapamiętany. */}
          <fieldset className="m-0 mt-4 max-w-xs min-w-0 border-0 p-0">
            <legend className="sr-only">{copy.viewLegend}</legend>
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
                {copy.viewMap}
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
                {copy.viewList}
              </button>
            </div>
          </fieldset>
          <div className="mt-3">
            {view === "graph" ? (
              <TopicGraph
                cards={cards}
                isInteractive={isHydrated}
                onOpen={handleOpen}
                peopleCardCount={peopleCardCount}
              />
            ) : (
              <TopicList cards={cards} isInteractive={isHydrated} onOpen={handleOpen} />
            )}
          </div>
        </>
      ) : null}

      {selectedCard && cards ? (
        <dialog
          ref={dialogRef}
          aria-label={copy.dialogAria}
          tabIndex={-1}
          onCancel={(event) => {
            event.preventDefault();
            handleClose();
          }}
          className="border-line-strong bg-surface text-ink fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto overscroll-contain rounded-2xl border p-0 backdrop:bg-black/50"
        >
          <DifficultyDialog
            card={selectedCard}
            cards={cards}
            avatarFirstName={avatar.avatarFirstName}
            resumeSessionId={resumeSessionId}
            mutations={mutations}
            onClose={handleClose}
          />
        </dialog>
      ) : null}
    </section>
  );
}
