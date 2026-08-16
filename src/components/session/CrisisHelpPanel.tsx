import { useEffect, useRef } from "react";
import { LifeBuoy, X } from "lucide-react";
import { CRISIS_RESOURCE_REGIONS } from "@/lib/session-safety/crisis-resources";
import { CrisisContactValue } from "./crisis-contact";

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
      className="border-warn-line bg-warn-soft text-warn hover:bg-warn-soft/70 focus:ring-warn-strong inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors focus:ring-2 focus:outline-none"
    >
      <LifeBuoy aria-hidden="true" className="h-4 w-4" />
      Potrzebuję pomocy teraz
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
      className="border-warn-line bg-warn-soft text-warn mt-4 rounded-lg border p-4 text-sm leading-6 focus:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">Realna pomoc, jeśli dzieje się coś pilnego</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zamknij kontakty pomocy"
          className="hover:bg-warn-soft focus:ring-warn-strong -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus:ring-2 focus:outline-none"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1">
        SafeSpace jest symulacją edukacyjną i nie jest pomocą kryzysową. Poniższe kontakty prowadzą do realnych służb i
        linii wsparcia.
      </p>

      <div className="mt-4 space-y-3 border-t border-current/20 pt-4">
        {CRISIS_RESOURCE_REGIONS.map((region) => (
          <div key={region.id}>
            <p className="font-semibold">{region.label}</p>
            <ul className="mt-2 space-y-2">
              {region.contacts.map((contact) => (
                <li key={`${region.id}-${contact.label}`}>
                  <span className="font-medium">{contact.label}:</span> <CrisisContactValue contact={contact} />
                  <span className="block">{contact.description}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs opacity-90">{region.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
