import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceContact, CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";

type NoticeVariant = "caution" | "hard_stop" | "retry" | "info";

interface SessionSafetyNoticeProps {
  variant: NoticeVariant;
  copy: SessionSafetyCopy | SessionAiFailureCopy | null;
  crisisResources?: readonly CrisisResourceRegion[];
}

function getVariantClasses(variant: NoticeVariant) {
  if (variant === "hard_stop") {
    return "border-danger-line bg-danger-soft text-danger";
  }

  if (variant === "retry") {
    return "border-warn-line bg-warn-soft text-warn";
  }

  return "border-brand-soft bg-surface-soft text-ink-soft";
}

function NoticeIcon({ variant }: { variant: NoticeVariant }) {
  if (variant === "hard_stop") {
    return <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />;
  }

  if (variant === "retry") {
    return <RefreshCw aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />;
  }

  return <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />;
}

/**
 * Only real dialable numbers become `tel:` links. `local_guidance` entries carry
 * a textual placeholder ("lokalny numer alarmowy") instead of a number, so linking
 * them would hand the user a dead dialer entry in the one moment that must not fail.
 */
function getDialableNumber(contact: CrisisResourceContact) {
  if (contact.kind === "local_guidance") {
    return null;
  }

  const digits = contact.value.replace(/[\s-]/g, "");

  return /^\+?\d{3,15}$/.test(digits) ? digits : null;
}

function CrisisContactValue({ contact }: { contact: CrisisResourceContact }) {
  const dialableNumber = getDialableNumber(contact);

  if (!dialableNumber) {
    return <span>{contact.value}</span>;
  }

  return (
    <a className="font-semibold underline underline-offset-2" href={`tel:${dialableNumber}`}>
      {contact.value}
    </a>
  );
}

export default function SessionSafetyNotice({ variant, copy, crisisResources = [] }: SessionSafetyNoticeProps) {
  const containerRef = useRef<HTMLElement | null>(null);
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
      className={`rounded-lg border p-4 text-sm leading-6 focus:outline-none ${getVariantClasses(variant)}`}
      role={isHardStop ? "alert" : "status"}
      tabIndex={isHardStop ? -1 : undefined}
    >
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

      {crisisResources.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-current/20 pt-4">
          {crisisResources.map((region) => (
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
      ) : null}
    </section>
  );
}
