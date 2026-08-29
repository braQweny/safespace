import type { CrisisResourceContact, CrisisResourceRegion } from "@/lib/session-safety/types";
import { cn } from "@/lib/utils";

/**
 * Only real dialable numbers become `tel:` links. `local_guidance` entries carry
 * a textual placeholder ("lokalny numer alarmowy") instead of a number, so linking
 * them would hand the user a dead dialer entry in the one moment that must not fail.
 */
export function getDialableNumber(contact: CrisisResourceContact) {
  if (contact.kind === "local_guidance") {
    return null;
  }

  const digits = contact.value.replace(/[\s-]/g, "");

  return /^\+?\d{3,15}$/.test(digits) ? digits : null;
}

export function CrisisContactValue({ contact }: { contact: CrisisResourceContact }) {
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

/**
 * Numer składany dużym szeryfem — w tym jednym momencie ma być czytelny z
 * odległości wyciągniętej ręki, a nie schowany w zdaniu.
 */
function CrisisContactNumber({ contact }: { contact: CrisisResourceContact }) {
  const dialableNumber = getDialableNumber(contact);
  const className = "text-brand-deep font-serif text-2xl leading-tight tabular-nums sm:text-3xl";

  if (!dialableNumber) {
    return <span className={cn(className, "text-xl sm:text-2xl")}>{contact.value}</span>;
  }

  return (
    <a
      className={cn(
        className,
        "focus-visible:ring-brand-ring rounded underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2",
      )}
      href={`tel:${dialableNumber}`}
    >
      {contact.value}
    </a>
  );
}

interface CrisisContactListProps {
  regions: readonly CrisisResourceRegion[];
  className?: string;
}

/**
 * Wspólna lista kontaktów dla panelu „Pomoc teraz” i dla zatrzymania rozmowy:
 * te same regiony, te same numery, ten sam spokojny układ.
 */
export function CrisisContactList({ regions, className }: CrisisContactListProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {regions.map((region) => (
        <div key={region.id}>
          <p className="text-ink-muted text-xs font-semibold tracking-[0.08em] uppercase">{region.label}</p>
          <ul className="border-line mt-2 border-t">
            {region.contacts.map((contact) => (
              <li
                key={`${region.id}-${contact.label}`}
                className="border-line grid gap-1 border-b py-3.5 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:items-baseline sm:gap-6"
              >
                <CrisisContactNumber contact={contact} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-ink font-semibold">{contact.label}</span>
                  <span className="text-ink-muted text-sm leading-6">{contact.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-faint mt-2 text-xs leading-5">{region.note}</p>
        </div>
      ))}
    </div>
  );
}
