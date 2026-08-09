import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";

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

export default function SessionSafetyNotice({ variant, copy, crisisResources = [] }: SessionSafetyNoticeProps) {
  if (!copy) {
    return null;
  }

  return (
    <section className={`rounded-lg border p-4 text-sm leading-6 ${getVariantClasses(variant)}`}>
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
                    <span className="font-medium">{contact.label}:</span> {contact.value}
                    <span className="block">{contact.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
