import type { RefObject } from "react";
import { useLocale } from "@/components/hooks/useLocale";
import { getTimedSessionCopy } from "./timed-session-copy";

interface SessionEndConfirmDialogProps {
  dialogRef: RefObject<HTMLDivElement | null>;
  isEnding: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Potwierdzenie zakończenia rozmowy pod paskiem: ten sam dialog dla rozmowy
 * pisanej i głosowej. Escape i „Wróć do rozmowy” wracają fokusem tam, skąd
 * dialog się otworzył (`useSessionChrome`).
 */
export default function SessionEndConfirmDialog({
  dialogRef,
  isEnding,
  onConfirm,
  onCancel,
}: SessionEndConfirmDialogProps) {
  const copy = getTimedSessionCopy(useLocale());

  return (
    <div className="px-4 pb-4 sm:px-6">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-label={copy.confirmEndAria}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
        className="border-line-accent bg-surface text-ink-soft shadow-card mx-auto mt-1 w-full max-w-3xl rounded-2xl border p-5 text-sm leading-6 focus:outline-none"
      >
        <p className="text-ink font-serif text-lg leading-snug font-medium">{copy.confirmEndTitle}</p>
        <p className="mt-1">{copy.confirmEndBody}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={isEnding}
            className="bg-brand-deep text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copy.confirmEndNow}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-11 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
          >
            {copy.confirmEndCancel}
          </button>
        </div>
      </div>
    </div>
  );
}
