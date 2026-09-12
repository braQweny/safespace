import type { ReactNode } from "react";
import { History } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { getTimedSessionCopy } from "./timed-session-copy";

interface SessionClosingCardProps {
  title: string;
  body: string;
  /** Link prosto do zapisu tej rozmowy w historii panelu. */
  historyHref: string;
  remainingSessionsCopy: string | null;
  /** Np. niewysłane słowa użytkownika (rozmowa pisana); rozmowa głosowa nic tu nie wstawia. */
  children?: ReactNode;
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
  children,
}: SessionClosingCardProps) {
  const copy = getTimedSessionCopy(useLocale());

  return (
    <div className="border-line-strong bg-surface shadow-card rounded-[20px] border p-5 sm:p-7">
      <h2 className="text-ink font-serif text-2xl leading-tight font-medium sm:text-[28px]">{title}</h2>
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
