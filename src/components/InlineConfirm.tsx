import { Loader2 } from "lucide-react";
import { useDialogEscapeLayer } from "@/components/hooks/useDialogEscapeLayers";
import { PILL_DANGER, PILL_OUTLINE } from "@/components/ui/button-styles";

interface InlineConfirmProps {
  /** Id nagłówka bloku (`aria-labelledby` grupy); jeden na stronie. */
  headingId: string;
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  /** Potwierdzenie w toku: przycisk potwierdzenia jest wyłączony. */
  isPending?: boolean;
  /** Etykieta w trakcie („Usuwanie…”); bez niej napis się nie zmienia. */
  pendingLabel?: string;
  /** Kręciołek obok etykiety w trakcie. */
  showsPendingSpinner?: boolean;
  /**
   * „Anuluj” i Escape (warstwa dialogu z `useDialogEscapeLayers`). Fokus po
   * anulowaniu przywraca wołający — tylko on wie, skąd blok się otworzył.
   */
  onCancel: () => void;
  onConfirm: () => void;
  /** `section` — pod nagłówkiem karty; `nested` — mniejszy, wewnątrz wiersza listy. */
  variant?: "section" | "nested";
}

const CONTAINER_CLASS = {
  section:
    "border-line-accent bg-surface text-ink-soft mt-4 rounded-xl border p-4 text-sm leading-6 focus:outline-none",
  nested:
    "border-line-accent bg-surface-soft text-ink-soft mt-2 rounded-xl border p-3 text-sm leading-6 focus:outline-none",
} as const;

const ACTIONS_CLASS = {
  section: "mt-3 flex flex-wrap gap-2",
  nested: "mt-2 flex flex-wrap gap-2",
} as const;

/**
 * Blok pojawia się poza fokusem — bez przeniesienia fokusu czytnik ekranu nie
 * dowiedziałby się, że coś wymaga decyzji. Stała funkcja modułu, więc React
 * woła ją raz, przy zamontowaniu bloku.
 */
export function focusOnMount(node: HTMLElement | null) {
  node?.focus();
}

/**
 * Potwierdzenie w miejscu zamiast osobnego okna: pytanie, jedno zdanie i dwa
 * przyciski. Montowane tylko na czas pytania — wtedy bierze fokus i łapie
 * Escape przed dialogiem, w którym stoi.
 */
export default function InlineConfirm({
  headingId,
  title,
  body,
  cancelLabel,
  confirmLabel,
  isPending = false,
  pendingLabel,
  showsPendingSpinner = false,
  onCancel,
  onConfirm,
  variant = "section",
}: InlineConfirmProps) {
  useDialogEscapeLayer(true, onCancel);

  return (
    <div ref={focusOnMount} role="group" aria-labelledby={headingId} tabIndex={-1} className={CONTAINER_CLASS[variant]}>
      <p id={headingId} className="font-semibold">
        {title}
      </p>
      <p className="mt-1">{body}</p>
      <div className={ACTIONS_CLASS[variant]}>
        <button type="button" onClick={onCancel} className={PILL_OUTLINE}>
          {cancelLabel}
        </button>
        <button type="button" disabled={isPending} onClick={onConfirm} className={PILL_DANGER}>
          {isPending && showsPendingSpinner ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {isPending && pendingLabel ? pendingLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
}
