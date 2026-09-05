import type { Locale } from "@/lib/i18n/locale";

/**
 * Słowo potwierdzające usunięcie konta w języku ekranu. Serwer przyjmuje
 * słowo dowolnego języka, bo użytkownik może przełączyć język między
 * wczytaniem formularza a wysłaniem; funkcja bazy dostaje zawsze stałą
 * wartość kontraktu (`USUWAM`).
 */
export const ACCOUNT_DELETION_CONFIRMATION_WORDS: Readonly<Record<Locale, string>> = {
  en: "DELETE",
  pl: "USUWAM",
};

/** Kontrakt `delete_own_account(p_confirmation)` — niezależny od języka ekranu. */
export const ACCOUNT_DELETION_RPC_CONFIRMATION = "USUWAM";

export function getAccountDeletionConfirmationWord(locale: Locale) {
  return ACCOUNT_DELETION_CONFIRMATION_WORDS[locale];
}

/** Dokładne słowo, bez przycinania — spacja na końcu nie jest potwierdzeniem. */
export function isAccountDeletionConfirmation(value: string) {
  return Object.values(ACCOUNT_DELETION_CONFIRMATION_WORDS).includes(value);
}
