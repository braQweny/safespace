import { useCallback, useEffect, useRef, useState } from "react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useLocale } from "@/components/hooks/useLocale";
import { usePeopleMemoryPreparation } from "@/components/hooks/usePeopleMemoryPreparation";
import { usePersonMutations } from "@/components/hooks/usePersonMutations";
import { LocaleProvider } from "@/components/LocaleProvider";
import { requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { PersonCard } from "@/lib/session-data/types";
import { isPeopleListSuccess } from "@/lib/session-flow/people-contract";
import { cn } from "@/lib/utils";
import PeopleCardList, { getOpenPersonCardButtonId } from "./PeopleCardList";
import PersonCardDialog from "./PersonCardDialog";
import { getPeopleCardsCopy } from "./people-cards-copy";

interface PeopleCardsProps {
  locale: Locale;
  /** Zapisana perspektywa — karty są jej, a „porozmawiaj” startuje z nią. */
  avatar: SelectedModalityAvatar;
  /** `null` = odczyt się nie udał (nigdy „brak kart”). */
  initialCards: PersonCard[] | null;
  peopleMemoryEnabled: boolean;
  /** Aktywna rozmowa tej samej perspektywy; z inną nie ma dokąd wracać z kartą. */
  resumeSessionId?: string | null;
  className?: string;
  /** Tylko do testów: otwarty dialog w pierwszym renderze. */
  initialSelectedPersonId?: string | null;
}

export default function PeopleCards({ locale, ...props }: PeopleCardsProps) {
  return (
    <LocaleProvider locale={locale}>
      <PeopleCardsView {...props} />
    </LocaleProvider>
  );
}

function PeopleCardsView({
  avatar,
  initialCards,
  peopleMemoryEnabled,
  resumeSessionId = null,
  className,
  initialSelectedPersonId = null,
}: Omit<PeopleCardsProps, "locale">) {
  const copy = getPeopleCardsCopy(useLocale());
  const isHydrated = useIsHydrated();
  const [cards, setCards] = useState<PersonCard[] | null>(initialCards);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedPersonId);
  const [notice, setNotice] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const requestedIdRef = useRef<string | null>(initialSelectedPersonId);

  const replaceCard = useCallback((card: PersonCard) => {
    setCards((current) => (current ? current.map((entry) => (entry.id === card.id ? card : entry)) : [card]));
  }, []);

  const removeCard = useCallback((personId: string) => {
    setCards((current) => (current ? current.filter((entry) => entry.id !== personId) : current));
  }, []);

  function closeDialogAfterRemoval() {
    dialogRef.current?.close();
    setSelectedId(null);
    document.getElementById("people-title")?.focus({ preventScroll: true });
  }

  const mutations = usePersonMutations({
    onUpdated: replaceCard,
    onForgotten: (personId) => {
      const name = cards?.find((entry) => entry.id === personId)?.name ?? "";
      removeCard(personId);
      setNotice(copy.forgotten(name));
      closeDialogAfterRemoval();
    },
    onFactDeleted: (personId, card) => {
      if (card) {
        replaceCard(card);
        return;
      }
      const name = cards?.find((entry) => entry.id === personId)?.name ?? "";
      removeCard(personId);
      setNotice(copy.forgotten(name));
      closeDialogAfterRemoval();
    },
    onError: (code) => {
      setNotice(copy.errors[code]);
    },
  });

  // Lista przyjeżdża z serwera; po zakończeniu przygotowania w tle odświeżamy
  // ją jednym GET, żeby nikt nie patrzył na pustą sekcję, choć karty już są.
  const refreshCards = useCallback(async () => {
    const result = await requestApiJson(`/api/session/people?avatar=${encodeURIComponent(avatar.avatarId)}`);
    if (result.kind === "json" && isPeopleListSuccess(result.body)) setCards(result.body.cards);
  }, [avatar.avatarId]);
  const onCardsUpdated = useCallback(() => {
    void refreshCards();
  }, [refreshCards]);
  usePeopleMemoryPreparation(avatar, peopleMemoryEnabled, onCardsUpdated);

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

  function handleOpen(personId: string) {
    setNotice(null);
    requestedIdRef.current = personId;
    setSelectedId(personId);
  }

  // Panel znika z DOM razem z dialogiem, więc fokus oddajemy świadomie — na
  // wiersz tej samej karty, zanim React zdąży odmontować dialog.
  function handleClose() {
    const personId = selectedId ?? requestedIdRef.current;
    dialogRef.current?.close();
    mutations.cancelForget();
    mutations.cancelDeleteFact();
    setSelectedId(null);
    if (personId) document.getElementById(getOpenPersonCardButtonId(personId))?.focus({ preventScroll: true });
  }

  return (
    <section
      className={cn("border-line-strong bg-surface shadow-card mt-8 rounded-[20px] border p-5 sm:p-6", className)}
      data-people-cards
    >
      <h2 id="people-title" tabIndex={-1} className="text-ink font-serif text-2xl leading-tight font-medium">
        {copy.title}
      </h2>
      <p className="text-ink-muted mt-1 text-sm leading-6">{copy.intro(avatar.avatarFirstName)}</p>

      {notice ? (
        <div className="bg-surface-soft text-ink-soft mt-4 rounded-xl p-4 text-sm leading-6" role="status">
          {notice}
        </div>
      ) : null}

      {!peopleMemoryEnabled ? (
        <div className="bg-surface-soft text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">
          {cards && cards.length > 0 ? copy.disabledWithCards : copy.disabled}{" "}
          <a
            href="/account/security#people-memory"
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
      ) : cards.length === 0 && peopleMemoryEnabled ? (
        <div className="bg-surface-soft text-ink-muted mt-4 rounded-xl p-4 text-sm leading-6">
          {copy.empty(avatar.avatarFirstName)}
        </div>
      ) : null}

      {cards && cards.length > 0 ? (
        <div className="mt-3">
          <PeopleCardList cards={cards} isInteractive={isHydrated} onOpen={handleOpen} />
        </div>
      ) : null}

      {selectedCard ? (
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
          <PersonCardDialog
            card={selectedCard}
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
