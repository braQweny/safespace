import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale } from "@/components/hooks/useLocale";
import { getSessionCopy } from "@/lib/session-copy";
import { cn } from "@/lib/utils";
import { getTimedSessionCopy } from "./timed-session-copy";

/**
 * Jedna cicha linijka zamiast bocznego panelu: granice są zawsze na widoku,
 * ale nie konkurują z rozmową. Na telefonie zwinięte do jednej, rozwijane
 * jednym dotknięciem — ten sam tekst, nie skrócona obietnica.
 */
export default function SessionBoundariesToggle() {
  const locale = useLocale();
  const copy = getTimedSessionCopy(locale);
  const { boundaries } = getSessionCopy(locale);
  const [areBoundariesOpen, setAreBoundariesOpen] = useState(false);

  return (
    <button
      type="button"
      aria-expanded={areBoundariesOpen}
      onClick={() => {
        setAreBoundariesOpen((open) => !open);
      }}
      className="text-ink-muted hover:text-ink focus-visible:ring-brand-ring flex items-start gap-1.5 rounded text-left text-xs leading-5 transition-colors focus:outline-none focus-visible:ring-2"
    >
      <span className={cn(!areBoundariesOpen && "line-clamp-1")}>
        <span className="text-ink-soft font-medium">{copy.boundariesLabel}</span> {boundaries}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform", areBoundariesOpen && "rotate-180")}
      />
    </button>
  );
}
