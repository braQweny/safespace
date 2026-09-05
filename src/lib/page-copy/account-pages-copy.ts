import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const ACCOUNT_PAGES_COPY = defineCopy(
  {
    security: {
      pageTitle: "Account - SafeSpace",
      passwordUpdated: "The password has been saved. You can sign in with e-mail and password or with Google.",
      back: "Back to the dashboard",
      title: "Account",
      signedInAs: "Signed in as",
      planTitle: "Plan and conversation allowance",
      eachLasts: (minutes: string) => `Each conversation lasts up to ${minutes}.`,
      deletingNote: "Deleting a conversation from the history does not return it to the allowance.",
      writeAboutPremium: "Write to us about premium",
      planReadFailed:
        "We couldn't read the account plan. Refresh the page in a moment — the allowance details are also on the dashboard.",
      passwordTitle: "Password",
      passwordIntro:
        "If the account was created with Google, setting a password adds e-mail sign-in without creating a second account.",
      dataTitle: "Your data and account deletion",
      dataIntro: "You delete a conversation after opening its transcript in the history. More about data processing:",
      privacyLink: "Privacy and terms",
      deleteAccount: "Delete account",
      deleteNote:
        "You'll delete the account together with the conversation history and avatar memory. We'll ask you to confirm in the next step.",
      adminTitle: "Administration",
      adminIntro:
        "This account has access to aggregate statistics. The admin panel does not show conversation content.",
      openAdmin: "Open the admin panel",
    },
    delete: {
      pageTitle: "Delete account - SafeSpace",
      title: "Delete account",
      introBefore: "You are deleting the account",
      introAfter: ". This action is permanent and cannot be undone.",
      consequences: [
        "We'll delete all your conversations, messages, summaries and avatar memory.",
        "We'll delete your profile and chosen avatar. You'll also lose access to the current account plan.",
        "Ongoing conversations will be interrupted and the account will be signed out on all devices.",
      ] as readonly string[],
      confirmLabel: (word: string) => `To confirm, type ${word}`,
      cancel: "Cancel",
      submit: "Delete the account permanently",
    },
    blocked: {
      pageTitle: "Account unavailable - SafeSpace",
      eyebrow: "SafeSpace",
      title: "The account is temporarily unavailable",
      unavailableBody:
        "We can't confirm access to the private part of the product right now. Try again later or sign out.",
      blockedBody:
        "Access to the private part of SafeSpace has been blocked for this account. You can sign out and contact SafeSpace support.",
      privacyNote: "For privacy reasons this page shows no account details or the reason for the decision.",
      contactPrefix: "Contact support:",
      contactSuffix: ". Write from your account's e‑mail address — do not include conversation content.",
      signOut: "Sign out",
      backHome: "Back to the home page",
      deleteAccount: "Delete the account and your data",
    },
  },
  {
    security: {
      pageTitle: "Konto - SafeSpace",
      passwordUpdated: "Hasło zostało zapisane. Możesz logować się e-mailem i hasłem albo przez Google.",
      back: "Wróć do panelu",
      title: "Konto",
      signedInAs: "Zalogowano jako",
      planTitle: "Plan i pula rozmów",
      eachLasts: (minutes) => `Każda rozmowa trwa do ${minutes}.`,
      deletingNote: "Usunięcie rozmowy z historii nie przywraca jej do puli.",
      writeAboutPremium: "Napisz w sprawie premium",
      planReadFailed:
        "Nie udało się odczytać planu konta. Odśwież stronę za chwilę — szczegóły puli rozmów zobaczysz też w panelu.",
      passwordTitle: "Hasło",
      passwordIntro:
        "Jeśli konto powstało przez Google, ustawienie hasła dodaje logowanie e-mailem bez tworzenia drugiego konta.",
      dataTitle: "Twoje dane i usunięcie konta",
      dataIntro: "Rozmowę usuniesz po otwarciu jej zapisu w historii. Więcej o przetwarzaniu danych:",
      privacyLink: "Prywatność i zasady",
      deleteAccount: "Usuń konto",
      deleteNote:
        "Usuniesz konto razem z historią rozmów i pamięcią awatarów. W następnym kroku poprosimy o potwierdzenie.",
      adminTitle: "Administracja",
      adminIntro: "To konto ma dostęp do statystyk zbiorczych. Panel administracyjny nie pokazuje treści rozmów.",
      openAdmin: "Otwórz panel administracyjny",
    },
    delete: {
      pageTitle: "Usuń konto - SafeSpace",
      title: "Usuń konto",
      introBefore: "Usuwasz konto",
      introAfter: ". Ta operacja jest trwała i nie można jej cofnąć.",
      consequences: [
        "Usuniemy wszystkie Twoje rozmowy, wiadomości, podsumowania i pamięć awatarów.",
        "Usuniemy profil i wybranego awatara. Utracisz też dostęp do obecnego planu konta.",
        "Trwające rozmowy zostaną przerwane, a konto zostanie wylogowane na wszystkich urządzeniach.",
      ],
      confirmLabel: (word) => `Aby potwierdzić, wpisz ${word}`,
      cancel: "Anuluj",
      submit: "Usuń konto bezpowrotnie",
    },
    blocked: {
      pageTitle: "Konto niedostępne - SafeSpace",
      eyebrow: "SafeSpace",
      title: "Konto jest chwilowo niedostępne",
      unavailableBody:
        "Nie możemy teraz potwierdzić dostępu do prywatnej części produktu. Spróbuj ponownie później albo wyloguj się.",
      blockedBody:
        "Dostęp do prywatnej części SafeSpace został zablokowany dla tego konta. Możesz się wylogować i skontaktować z obsługą SafeSpace.",
      privacyNote: "Ze względów prywatności ta strona nie pokazuje szczegółów konta ani powodu decyzji.",
      contactPrefix: "Kontakt z obsługą:",
      contactSuffix: ". Napisz z adresu e‑mail swojego konta — nie podawaj treści rozmów.",
      signOut: "Wyloguj się",
      backHome: "Wróć na stronę główną",
      deleteAccount: "Usuń konto i swoje dane",
    },
  },
);

export function getAccountPagesCopy(locale: Locale) {
  return ACCOUNT_PAGES_COPY[locale];
}
