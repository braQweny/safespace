import type { CrisisResourceContact } from "@/lib/session-safety/types";

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
