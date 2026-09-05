import { RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocale } from "@/components/hooks/useLocale";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import { cn } from "@/lib/utils";
import { CrisisContactList } from "./crisis-contact";
import { getSessionMessagesCopy } from "./session-messages-copy";

type NoticeVariant = "caution" | "hard_stop" | "retry" | "info";

interface SessionSafetyNoticeProps {
  variant: NoticeVariant;
  copy: SessionSafetyCopy | SessionAiFailureCopy | null;
  crisisResources?: readonly CrisisResourceRegion[];
}

function getVariantClasses(variant: NoticeVariant) {
  if (variant === "hard_stop") {
    // Zatrzymanie rozmowy bez czerwieni: spokojna karta, numery dużym pismem.
    return "border-line-accent bg-surface text-ink-soft shadow-card p-6 sm:p-8";
  }

  if (variant === "retry") {
    return "border-warn-line bg-warn-soft text-warn p-4 sm:p-5";
  }

  return "border-line bg-surface-soft text-ink-soft p-4 sm:p-5";
}

function NoticeIcon({ variant }: { variant: NoticeVariant }) {
  if (variant === "retry") {
    return <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />;
  }

  return <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />;
}

export default function SessionSafetyNotice({ variant, copy, crisisResources = [] }: SessionSafetyNoticeProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const { safetyBoundary } = getSessionMessagesCopy(useLocale());
  const isHardStop = variant === "hard_stop";
  const title = copy?.title ?? null;

  // A hard stop ends the conversation and replaces it with crisis contacts.
  // `role="alert"` announces the copy; moving focus puts a keyboard or screen
  // reader user on the numbers instead of leaving them in the dead composer.
  useEffect(() => {
    if (isHardStop && title) {
      containerRef.current?.focus();
    }
  }, [isHardStop, title]);

  if (!copy) {
    return null;
  }

  return (
    <section
      ref={containerRef}
      aria-live={isHardStop ? "assertive" : "polite"}
      className={cn("rounded-2xl border text-sm leading-6 focus:outline-none", getVariantClasses(variant))}
      role={isHardStop ? "alert" : "status"}
      tabIndex={isHardStop ? -1 : undefined}
    >
      {isHardStop ? (
        <div>
          <p className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">{safetyBoundary}</p>
          <h2 className="text-ink mt-2 font-serif text-2xl leading-tight font-medium sm:text-3xl">{copy.title}</h2>
          <p className="text-ink-soft mt-3 text-base leading-7">{copy.body}</p>
          {"nextSteps" in copy && copy.nextSteps.length > 0 ? (
            <ul className="text-ink-soft mt-3 list-disc space-y-1 pl-5 text-base leading-7">
              {copy.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-3">
          <NoticeIcon variant={variant} />
          <div>
            <h2 className="font-semibold">{copy.title}</h2>
            <p className="mt-1">{copy.body}</p>
            {"nextSteps" in copy && copy.nextSteps.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {copy.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      {crisisResources.length > 0 ? <CrisisContactList regions={crisisResources} className="mt-6" /> : null}
    </section>
  );
}
