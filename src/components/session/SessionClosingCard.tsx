import { useEffect, useRef, useState, type ReactNode } from "react";
import { History } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import type { SessionStartPageStateKind } from "@/lib/session-flow/session-state";
import { getTimedSessionCopy } from "./timed-session-copy";

interface SessionClosingCardProps {
  title: string;
  body: string;
  /** Link prosto do zapisu tej rozmowy w historii panelu. */
  historyHref: string;
  remainingSessionsCopy: string | null;
  /**
   * Rozmowa skończyła się na oczach użytkownika: nagłówek karty przejmuje
   * fokus, który razem z polem pisania spadłby na `<body>`. Liczy się wartość
   * z chwili zamontowania karty.
   */
  takesFocus?: boolean;
  /** Np. niewysłane słowa użytkownika (rozmowa pisana); rozmowa głosowa nic tu nie wstawia. */
  children?: ReactNode;
}

const ENDED_KINDS: readonly SessionStartPageStateKind[] = ["completed", "expired", "interrupted"];

/**
 * Czy karta zamknięcia ma wziąć fokus. Rozmowa zakończona już przy wejściu na
 * stronę go nie zabiera, a zatrzymanie bezpieczeństwa ma własny — fokus
 * stoi wtedy na numerach pomocy (`SessionSafetyNotice`).
 */
export function shouldClosingCardTakeFocus(
  initialKind: SessionStartPageStateKind,
  noticeVariant: string | null | undefined,
) {
  return !ENDED_KINDS.includes(initialKind) && noticeVariant !== "hard_stop";
}

/**
 * Jeden krok główny po rozmowie: powrót do panelu. Zapis obok, cicho. Ta sama
 * karta zamyka rozmowę pisaną i głosową.
 */
export default function SessionClosingCard({
  title,
  body,
  historyHref,
  remainingSessionsCopy,
  takesFocus = false,
  children,
}: SessionClosingCardProps) {
  const copy = getTimedSessionCopy(useLocale());
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  // Zamrożone przy montowaniu: późniejsza zmiana powiadomienia nie może
  // odebrać fokusu numerom pomocy ani rzucić go z powrotem na kartę.
  const [focusOnMount] = useState(takesFocus);

  useEffect(() => {
    if (!focusOnMount) {
      return;
    }

    // Tylko fokus, który nie ma już dokąd wrócić. Wciąż otwarta nakładka
    // pomocy albo inny widoczny element go zatrzymuje.
    const active = document.activeElement;

    if (active && active !== document.body) {
      return;
    }

    // Karta stoi na górze kolumny, a domyślny `focus()` przewijałby jeszcze
    // przycięty `main` strony rozmowy.
    headingRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <div className="border-line-strong bg-surface shadow-card rounded-[20px] border p-5 sm:p-7">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-ink font-serif text-2xl leading-tight font-medium focus:outline-none sm:text-[28px]"
      >
        {title}
      </h2>
      <p className="text-ink-soft mt-2 text-base leading-7">{body}</p>
      {children}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <a
          href="/dashboard"
          className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-12 items-center justify-center rounded-[14px] px-6 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
        >
          {copy.backToDashboard}
        </a>
        <a
          href={historyHref}
          className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-12 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
        >
          <History aria-hidden="true" className="h-4 w-4" />
          {copy.openTranscript}
        </a>
      </div>
      {remainingSessionsCopy ? (
        <p className="text-ink-muted mt-3 text-[13px] leading-5">{remainingSessionsCopy}</p>
      ) : null}
    </div>
  );
}
