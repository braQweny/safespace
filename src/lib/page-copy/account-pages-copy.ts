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
      voiceHeading: "Voice conversations:",
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
      memory: {
        title: "Conversation memory",
        intro:
          "The avatar notes people and topics from your own words. Everything stays private to your account; switching a part off stops the recording, and after switching it back on the avatar notes only new conversations.",
        modeOffIntro:
          "This part is currently switched off. Cards saved earlier are still stored — you can delete them here.",
        peopleLabel: "People from conversations",
        peopleHint: "Who the people you mention are to you.",
        topicsLabel: "Topics from conversations",
        topicsHint: "What you struggle with, who it comes up with and how you cope.",
        viewLink: "See what the avatar remembers",
        deleteSummary: "Delete saved cards",
        deleteBody:
          "Conversation transcripts, their summaries and the avatar memory stay. Deleting also switches off the recording of what you delete. This cannot be undone.",
        scopeLegend: "What to delete",
        scopePeople: "only people",
        scopeTopics: "only topics",
        scopeAll: "people and topics",
        deleteConfirmLabel: "I understand that the selected cards will be deleted permanently.",
        deleteSubmit: "Delete",
        status: {
          deleted_people: "All people cards have been deleted and remembering people is switched off.",
          deleted_topics: "All topics have been deleted and noting topics is switched off.",
          deleted_all: "People and topics have been deleted and both are switched off.",
          delete_failed: "The cards couldn't be deleted. Please try again in a moment.",
          delete_confirmation_required: "Tick the confirmation before deleting.",
          invalid_scope: "Choose what to delete.",
        },
      },
      peopleMemory: {
        readFailed: "We couldn't read this setting. Refresh the page in a moment.",
        toggleLegend: "Remember people from conversations",
        on: "On",
        off: "Off",
        effects:
          "Switching off stops the recording and detaches the cards from an ongoing conversation. After switching back on, the avatar records people only from new conversations.",
        status: {
          saved: "The setting has been saved.",
          save_failed: "The setting couldn't be saved. Please try again in a moment.",
          deleted: "All people cards have been deleted and remembering is switched off.",
          delete_failed: "The cards couldn't be deleted. Please try again in a moment.",
          delete_confirmation_required: "Tick the confirmation before deleting the cards.",
          unavailable: "Remembering people is currently unavailable, so it can't be switched on.",
        },
      },
      topicMap: {
        readFailed: "We couldn't read this setting. Refresh the page in a moment.",
        toggleLegend: "Note topics from conversations",
        on: "On",
        off: "Off",
        effects:
          "Switching off stops the recording; saved topics stay until you delete them. After switching back on, the avatar notes topics only from new conversations.",
        status: {
          saved: "The setting has been saved.",
          save_failed: "The setting couldn't be saved. Please try again in a moment.",
          deleted: "The topics have been deleted and switched off.",
          delete_failed: "The topics couldn't be deleted. Please try again in a moment.",
          delete_confirmation_required: "Tick the confirmation before deleting the topics.",
          unavailable: "Topics from conversations are currently unavailable, so they can't be switched on.",
        },
      },
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
      voiceHeading: "Rozmowy głosowe:",
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
      memory: {
        title: "Pamięć rozmów",
        intro:
          "Awatar zapisuje z Twoich słów osoby i tematy z rozmów. Wszystko zostaje prywatne dla Twojego konta; wyłączenie części zatrzymuje zapisywanie, a po ponownym włączeniu awatar zapisuje tylko z nowych rozmów.",
        modeOffIntro:
          "Ta część jest obecnie wyłączona. Zapisane wcześniej karty wciąż są przechowywane — możesz je tu usunąć.",
        peopleLabel: "Osoby z rozmów",
        peopleHint: "Kim są dla Ciebie ludzie, o których mówisz.",
        topicsLabel: "Tematy z rozmów",
        topicsHint: "Z czym się mierzysz, przy kim to wraca i jak sobie radzisz.",
        viewLink: "Zobacz, co pamięta awatar",
        deleteSummary: "Usuń zapisane karty",
        deleteBody:
          "Zapisy rozmów, ich podsumowania i pamięć awatara zostają. Usunięcie wyłącza też zapisywanie tego, co usuwasz. Tej operacji nie można cofnąć.",
        scopeLegend: "Co usunąć",
        scopePeople: "tylko osoby",
        scopeTopics: "tylko tematy",
        scopeAll: "osoby i tematy",
        deleteConfirmLabel: "Rozumiem, że wybrane karty zostaną trwale usunięte.",
        deleteSubmit: "Usuń",
        status: {
          deleted_people: "Wszystkie karty osób zostały usunięte, a zapamiętywanie osób wyłączone.",
          deleted_topics: "Wszystkie tematy zostały usunięte, a zapisywanie tematów wyłączone.",
          deleted_all: "Osoby i tematy zostały usunięte, a zapisywanie obu wyłączone.",
          delete_failed: "Nie udało się usunąć kart. Spróbuj ponownie za chwilę.",
          delete_confirmation_required: "Zaznacz potwierdzenie, zanim usuniesz.",
          invalid_scope: "Wybierz, co usunąć.",
        },
      },
      peopleMemory: {
        readFailed: "Nie udało się odczytać tego ustawienia. Odśwież stronę za chwilę.",
        toggleLegend: "Zapamiętuj osoby z rozmów",
        on: "Włączone",
        off: "Wyłączone",
        effects:
          "Wyłączenie zatrzymuje zapisywanie i odłącza karty od trwającej rozmowy. Po ponownym włączeniu awatar zapisuje osoby tylko z nowych rozmów.",
        status: {
          saved: "Ustawienie zostało zapisane.",
          save_failed: "Nie udało się zapisać ustawienia. Spróbuj ponownie za chwilę.",
          deleted: "Wszystkie karty osób zostały usunięte, a zapamiętywanie wyłączone.",
          delete_failed: "Nie udało się usunąć kart. Spróbuj ponownie za chwilę.",
          delete_confirmation_required: "Zaznacz potwierdzenie, zanim usuniesz karty.",
          unavailable: "Zapamiętywanie osób jest obecnie niedostępne, więc nie da się go włączyć.",
        },
      },
      topicMap: {
        readFailed: "Nie udało się odczytać tego ustawienia. Odśwież stronę za chwilę.",
        toggleLegend: "Zapisuj tematy z rozmów",
        on: "Włączone",
        off: "Wyłączone",
        effects:
          "Wyłączenie zatrzymuje zapisywanie; zapisane tematy zostają, dopóki ich nie usuniesz. Po ponownym włączeniu awatar zapisuje tematy tylko z nowych rozmów.",
        status: {
          saved: "Ustawienie zostało zapisane.",
          save_failed: "Nie udało się zapisać ustawienia. Spróbuj ponownie za chwilę.",
          deleted: "Tematy zostały usunięte i wyłączone.",
          delete_failed: "Nie udało się usunąć tematów. Spróbuj ponownie za chwilę.",
          delete_confirmation_required: "Zaznacz potwierdzenie, zanim usuniesz tematy.",
          unavailable: "Zapisywanie tematów jest obecnie niedostępne, więc nie da się go włączyć.",
        },
      },
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
