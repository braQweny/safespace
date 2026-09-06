import type { CrisisResourceContact } from "./types";

/**
 * Only real dialable numbers become `tel:` links. `local_guidance` entries carry
 * a textual placeholder ("your local emergency number") instead of a number, so
 * linking them would hand the user a dead dialer entry in the one moment that
 * must not fail. Shared by the React list in the conversation and the Astro
 * blocks on the dashboard, the landing and the privacy page, so every surface
 * links the same numbers the same way.
 */
export function getDialableNumber(contact: CrisisResourceContact): string | null {
  if (contact.kind === "local_guidance") {
    return null;
  }

  const digits = contact.value.replace(/[\s-]/g, "");

  return /^\+?\d{3,15}$/.test(digits) ? digits : null;
}

export function getCrisisContactTelHref(contact: CrisisResourceContact): string | null {
  const dialableNumber = getDialableNumber(contact);

  return dialableNumber ? `tel:${dialableNumber}` : null;
}
