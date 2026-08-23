import { SUPPORT_EMAIL } from "astro:env/server";

/**
 * Jedyne źródło adresu kontaktowego pokazywanego użytkownikom (stopka, strona
 * blokady konta, ślepy zaułek limitu sesji). Premium nie ma płatności — jest
 * przyznawane ręcznie — więc kontakt jest jedyną drogą dalej i musi być
 * spójny w całym produkcie.
 */
export interface SupportContact {
  email: string | null;
  mailtoHref: string | null;
}

/**
 * Oficjalna skrzynka kontaktowa SafeSpace. Adres jest publiczny, więc nie
 * wymaga konfiguracji środowiska — `SUPPORT_EMAIL` może go nadpisać (np. na
 * osobnym wdrożeniu), a pusta wartość wraca do domyślnego.
 */
export const DEFAULT_SUPPORT_EMAIL = "safespacenow123@gmail.com";

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function resolveSupportEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";

  if (!trimmed || !EMAIL_SHAPE.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function toSupportContact(raw: string | null | undefined): SupportContact {
  const email = resolveSupportEmail(raw) ?? DEFAULT_SUPPORT_EMAIL;

  return {
    email,
    mailtoHref: email ? `mailto:${email}` : null,
  };
}

export function getSupportContact(): SupportContact {
  return toSupportContact(SUPPORT_EMAIL);
}
