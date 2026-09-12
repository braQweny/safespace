import type { RefObject } from "react";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import { getModalityCopy } from "@/lib/modality-copy";
import type { SessionView } from "@/lib/session-flow/session-state";
import { CrisisHelpPanel, CrisisHelpTrigger } from "./CrisisHelpPanel";
import SessionEndConfirmDialog from "./SessionEndConfirmDialog";
import SessionTimer from "./SessionTimer";
import { getTimedSessionCopy } from "./timed-session-copy";

export function getSessionTotalSeconds(session: SessionView | null) {
  if (!session?.startedAt || !session.expiresAt) {
    return null;
  }

  const startedAtMs = Date.parse(session.startedAt);
  const expiresAtMs = Date.parse(session.expiresAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || expiresAtMs <= startedAtMs) {
    return null;
  }

  return Math.round((expiresAtMs - startedAtMs) / 1000);
}

interface SessionScreenHeaderProps {
  avatar: SelectedModalityAvatar;
  /** Tytuł stanu rozmowy: sr-only przy trwającej, pigułka po zakończeniu. */
  stateTitle: string;
  session: SessionView | null;
  canEndSession: boolean;
  isEnding: boolean;
  isConfirmingEnd: boolean;
  onExpired: () => void;
  onRequestEnd: () => void;
  onConfirmEnd: () => void;
  onCancelEnd: () => void;
  endButtonRef: RefObject<HTMLButtonElement | null>;
  confirmEndRef: RefObject<HTMLDivElement | null>;
  crisisTriggerRef: RefObject<HTMLButtonElement | null>;
  isCrisisHelpOpen: boolean;
  onToggleCrisisHelp: () => void;
  onCloseCrisisHelp: () => void;
}

/**
 * Jedyny nagłówek strony rozmowy — pisanej i głosowej: łuk do panelu, twarz
 * i imię, licznik, „Pomoc”, „Zakończ rozmowę”, nakładka pomocy kryzysowej i
 * dialog potwierdzenia. Rozmowa głosowa nie dokłada tu nic swojego: jej stan
 * (słucham, mówi, wyciszony) stoi w pasku pod zapisem, przy kciuku.
 */
export default function SessionScreenHeader({
  avatar,
  stateTitle,
  session,
  canEndSession,
  isEnding,
  isConfirmingEnd,
  onExpired,
  onRequestEnd,
  onConfirmEnd,
  onCancelEnd,
  endButtonRef,
  confirmEndRef,
  crisisTriggerRef,
  isCrisisHelpOpen,
  onToggleCrisisHelp,
  onCloseCrisisHelp,
}: SessionScreenHeaderProps) {
  const locale = useLocale();
  const copy = getTimedSessionCopy(locale);
  const avatarCopy = getModalityCopy(locale, avatar.modalityId);
  const avatarFirstName = avatar.avatarFirstName;

  return (
    <header className="border-line bg-surface/70 relative z-10 shrink-0 border-b backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {/*
            Ten pasek jest jedynym nagłówkiem strony rozmowy. Wcześniej stał pod
            `AppHeader`, więc na telefonie 120 px znikało na dwa paski, zanim
            pojawiło się słowo rozmowy — a jedyne, co robił ten drugi, to powrót
            do panelu. Łuk przejmuje dokładnie to zadanie.
          */}
          <a
            href="/dashboard"
            aria-label={copy.backToDashboard}
            className="border-line-strong bg-surface hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]">
              <path
                d="M4.5 21.5V12a7.5 7.5 0 0 1 15 0v9.5Z"
                className="fill-brand-soft stroke-brand"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          {/* Twarz stoi przy każdej wypowiedzi w zapisie, więc na telefonie
              w pasku jest zbędna — tam liczy się każdy piksel szerokości. */}
          <img
            src={avatar.assetPath}
            alt=""
            width="96"
            height="96"
            className="hidden h-9 w-9 shrink-0 rounded-full object-cover sm:block"
            loading="lazy"
          />
          <div className="min-w-0">
            {/* Na telefonie samo imię: pełna nazwa perspektywy stoi przy każdej
                wypowiedzi w zapisie, a w jednym rzędzie paska liczy się każdy
                piksel — to on robi miejsce na „Zakończ” słowem. */}
            <h1 className="text-ink truncate font-sans text-[15px] leading-tight font-semibold tracking-normal">
              <span className="sm:hidden">{avatarFirstName}</span>
              <span className="hidden sm:inline">{avatarCopy.avatarName}</span>
            </h1>
            <p className="text-ink-muted hidden truncate text-xs leading-tight sm:block">{avatarCopy.modalityName}</p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:gap-3">
          {canEndSession && session ? (
            <>
              {/* Stan czyta się z pierścienia; czytnik ekranu dostaje go słowami. */}
              <p className="sr-only">{stateTitle}</p>
              <SessionTimer
                key={session.id}
                expiresAt={session.expiresAt}
                initialRemainingSeconds={session.remainingSeconds}
                totalSeconds={getSessionTotalSeconds(session)}
                onExpired={onExpired}
              />
              <CrisisHelpTrigger ref={crisisTriggerRef} isOpen={isCrisisHelpOpen} onToggle={onToggleCrisisHelp} />
              {/* Tura w locie nie blokuje wyjścia: serwer sam sprawdza status
                  sesji, zanim zapisze odpowiedź. */}
              <button
                ref={endButtonRef}
                type="button"
                onClick={onRequestEnd}
                disabled={isEnding || isConfirmingEnd}
                className="text-ink-muted hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3.5"
              >
                {/* Słowo, nie ikona: drzwi nie są konwencją „zakończ”, a jedynego
                    wyjścia z rozmowy nie powinno się zgadywać. Na telefonie
                    krócej, jak „Pomoc” obok „Pomoc teraz”. */}
                {isEnding ? (
                  <>
                    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                    <span>{copy.ending}</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">{copy.endShort}</span>
                    <span className="hidden sm:inline">{copy.endLong}</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <p className="text-ink-muted inline-flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="bg-clay h-2 w-2 shrink-0 rounded-full" />
                {stateTitle}
              </p>
              <CrisisHelpTrigger ref={crisisTriggerRef} isOpen={isCrisisHelpOpen} onToggle={onToggleCrisisHelp} />
            </>
          )}
        </div>
      </div>

      {isCrisisHelpOpen ? (
        // Nakładka pod paskiem, nie wstawka w nagłówku: wstawiony w `shrink-0`
        // nagłówek panel z numerami spychał na telefonie zapis i pole pisania
        // za ekran, a sam kończył się poza nim bez możliwości przewinięcia.
        // Pływa nad rozmową, która zostaje na swoim miejscu, i przewija się sam.
        <div className="absolute inset-x-0 top-full z-20 px-4 pb-4 sm:px-6">
          <CrisisHelpPanel onClose={onCloseCrisisHelp} />
        </div>
      ) : null}

      {canEndSession && isConfirmingEnd ? (
        <SessionEndConfirmDialog
          dialogRef={confirmEndRef}
          isEnding={isEnding}
          onConfirm={onConfirmEnd}
          onCancel={onCancelEnd}
        />
      ) : null}
    </header>
  );
}
