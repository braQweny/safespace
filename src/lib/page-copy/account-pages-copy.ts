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
      peopleMemory: {
        title: "People from your conversations",
        intro:
          "The avatar keeps short cards about the people you mention: who they are to you, what you said, how you feel about it. Everything comes from your own words and stays private to your account.",
        modeOffIntro:
          "This feature is currently switched off. Cards saved earlier are still stored — you can delete them here.",
        readFailed: "We couldn't read this setting. Refresh the page in a moment.",
        toggleLegend: "Remember people from conversations",
        on: "On",
        off: "Off",
        effects:
          "Switching off stops the recording and detaches the cards from an ongoing conversation. After switching back on, the avatar records people only from new conversations.",
        deleteAllSummary: "Switch off and delete all cards",
        deleteAllBody:
          "All people cards for every perspective are deleted and remembering is switched off. Conversation transcripts and the avatar memory stay unchanged. This cannot be undone.",
        deleteAllConfirmLabel: "I understand that all cards will be deleted permanently.",
        deleteAllSubmit: "Delete all cards",
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
        title: "Topic map",
        intro:
          "The avatar notes the difficulties you say you struggle with, the people they come up with, and the ways of coping that came up in conversations. Everything comes from your own words and stays private to your account.",
        modeOffIntro:
          "This feature is currently switched off. Difficulties saved earlier are still stored — you can delete them here.",
        readFailed: "We couldn't read this setting. Refresh the page in a moment.",
        toggleLegend: "Keep a topic map from conversations",
        on: "On",
        off: "Off",
        effects:
          "Switching off stops the recording; saved difficulties stay on the dashboard until you delete them. After switching back on, the avatar notes difficulties only from new conversations.",
        deleteAllSummary: "Switch off and delete the map",
        deleteAllBody:
          "All difficulties for every perspective are deleted, with their entries and links to people, and the map is switched off. People cards, conversation transcripts and the avatar memory stay unchanged. This cannot be undone.",
        deleteAllConfirmLabel: "I understand that the whole topic map will be deleted permanently.",
        deleteAllSubmit: "Delete the map",
        status: {
          saved: "The setting has been saved.",
          save_failed: "The setting couldn't be saved. Please try again in a moment.",
          deleted: "The topic map has been deleted and switched off.",
          delete_failed: "The map couldn't be deleted. Please try again in a moment.",
          delete_confirmation_required: "Tick the confirmation before deleting the map.",
          unavailable: "The topic map is currently unavailable, so it can't be switched on.",
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
      peopleMemory: {
        title: "Osoby z Twoich rozmów",
        intro:
          "Awatar prowadzi krótkie karty osób, o których wspominasz: kim są dla Ciebie, co o nich mówisz, jak to przeżywasz. Wszystko pochodzi z Twoich słów i zostaje prywatne dla Twojego konta.",
        modeOffIntro:
          "Ta funkcja jest obecnie wyłączona. Zapisane wcześniej karty wciąż są przechowywane — możesz je tu usunąć.",
        readFailed: "Nie udało się odczytać tego ustawienia. Odśwież stronę za chwilę.",
        toggleLegend: "Zapamiętuj osoby z rozmów",
        on: "Włączone",
        off: "Wyłączone",
        effects:
          "Wyłączenie zatrzymuje zapisywanie i odłącza karty od trwającej rozmowy. Po ponownym włączeniu awatar zapisuje osoby tylko z nowych rozmów.",
        deleteAllSummary: "Wyłącz i usuń wszystkie karty",
        deleteAllBody:
          "Usuniemy wszystkie karty osób dla każdej perspektywy i wyłączymy zapamiętywanie. Zapisy rozmów i pamięć awatara zostają bez zmian. Tej operacji nie można cofnąć.",
        deleteAllConfirmLabel: "Rozumiem, że wszystkie karty zostaną trwale usunięte.",
        deleteAllSubmit: "Usuń wszystkie karty",
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
        title: "Mapa tematów",
        intro:
          "Awatar zapisuje trudności, o których mówisz, że się z nimi mierzysz, osoby, przy których się pojawiają, i sposoby radzenia sobie, które padły w rozmowach. Wszystko pochodzi z Twoich słów i zostaje prywatne dla Twojego konta.",
        modeOffIntro:
          "Ta funkcja jest obecnie wyłączona. Zapisane wcześniej trudności wciąż są przechowywane — możesz je tu usunąć.",
        readFailed: "Nie udało się odczytać tego ustawienia. Odśwież stronę za chwilę.",
        toggleLegend: "Zapisuj mapę tematów z rozmów",
        on: "Włączone",
        off: "Wyłączone",
        effects:
          "Wyłączenie zatrzymuje zapisywanie; zapisane trudności zostają w panelu, dopóki ich nie usuniesz. Po ponownym włączeniu awatar zapisuje trudności tylko z nowych rozmów.",
        deleteAllSummary: "Wyłącz i usuń mapę",
        deleteAllBody:
          "Usuniemy wszystkie trudności dla każdej perspektywy razem z wpisami i powiązaniami z osobami i wyłączymy mapę. Karty osób, zapisy rozmów i pamięć awatara zostają bez zmian. Tej operacji nie można cofnąć.",
        deleteAllConfirmLabel: "Rozumiem, że cała mapa tematów zostanie trwale usunięta.",
        deleteAllSubmit: "Usuń mapę",
        status: {
          saved: "Ustawienie zostało zapisane.",
          save_failed: "Nie udało się zapisać ustawienia. Spróbuj ponownie za chwilę.",
          deleted: "Mapa tematów została usunięta i wyłączona.",
          delete_failed: "Nie udało się usunąć mapy. Spróbuj ponownie za chwilę.",
          delete_confirmation_required: "Zaznacz potwierdzenie, zanim usuniesz mapę.",
          unavailable: "Mapa tematów jest obecnie niedostępna, więc nie da się jej włączyć.",
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
