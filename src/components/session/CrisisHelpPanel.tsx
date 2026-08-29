import { useEffect, useRef } from "react";
import { Phone, X } from "lucide-react";
import { CRISIS_RESOURCE_REGIONS } from "@/lib/session-safety/crisis-resources";
import { CrisisContactList } from "./crisis-contact";

/**
 * Crisis contacts used to appear only after the safety classifier raised a hard
 * stop. Someone who needs a real number but never writes anything the classifier
 * flags had nowhere to click, so this keeps the same catalog one press away for
 * the whole session — without implying the app itself is crisis care.
 *
 * Split into trigger and panel so the caller can keep the button inline with the
 * other header controls while the panel spans the full header width below them.
 */

interface CrisisHelpTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function CrisisHelpTrigger({ isOpen, onToggle }: CrisisHelpTriggerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-controls="crisis-help-panel"
      className="border-line-accent bg-surface text-ink hover:bg-surface-soft focus-visible:ring-brand-ring inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 sm:h-10 sm:gap-2 sm:px-3.5"
    >
      {/* Glina tylko na ikonie: przycisk ma być znajdowalny, nie alarmujący. */}
      <Phone aria-hidden="true" className="text-clay h-4 w-4" />
      {/* Pomoc zostaje na widoku także na telefonie — skraca się napis, nie dostęp. */}
      <span className="sm:hidden">Pomoc</span>
      <span className="hidden sm:inline">Pomoc teraz</span>
    </button>
  );
}

interface CrisisHelpPanelProps {
  onClose: () => void;
}

export function CrisisHelpPanel({ onClose }: CrisisHelpPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      id="crisis-help-panel"
      role="dialog"
      aria-label="Kontakty pomocy kryzysowej"
      tabIndex={-1}
      className="border-line-accent bg-surface text-ink-soft shadow-card mx-auto mt-3 w-full max-w-3xl rounded-2xl border p-5 text-sm leading-6 focus:outline-none sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">Pomoc teraz</p>
          <p className="text-ink mt-1 font-serif text-xl leading-snug">Realna pomoc, jeśli dzieje się coś pilnego</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kontakty pomocy"
          className="text-ink-muted hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring -mt-1 -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2">
        SafeSpace jest symulacją edukacyjną i nie jest pomocą kryzysową. Poniższe kontakty prowadzą do realnych służb i
        linii wsparcia.
      </p>

      <CrisisContactList regions={CRISIS_RESOURCE_REGIONS} className="mt-5" />
    </div>
  );
}
