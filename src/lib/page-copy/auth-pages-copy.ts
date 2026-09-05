import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const AUTH_PAGES_COPY = defineCopy(
  {
    or: "or",
    googleButton: "Continue with Google",
    signin: {
      pageTitle: "Sign in - SafeSpace",
      title: "Sign in",
      intro: "Choose Google or an e-mail account.",
      accountDeleted:
        "Your account has been deleted along with the conversation history and avatar memory. You have been signed out.",
      forgotPassword: "Forgot your password?",
      noAccount: "Don't have an account?",
      createAccount: "Create an account",
    },
    signup: {
      pageTitle: "Create an account - SafeSpace",
      title: "Create an account",
      intro: "Sign up with Google or e-mail. Then you'll choose a perspective for your first conversation.",
      haveAccount: "Already have an account?",
      signIn: "Sign in",
    },
    forgot: {
      pageTitle: "Password reset - SafeSpace",
      title: "Forgot your password?",
      intro: "Enter your account's e-mail address and we'll send a link to set a new password.",
      sent: "If this address has a SafeSpace account, you'll receive an e-mail with a password reset link shortly. Check your spam folder too.",
      emailLabel: "E-mail address",
      submit: "Send the password reset link",
      backToSignIn: "Back to sign-in",
    },
    confirm: {
      headingSignedIn: "Your account is active",
      headingInbox: "Check your inbox",
      pageTitle: (heading: string) => `${heading} - SafeSpace`,
      signedInBody: "You can go to the private part of SafeSpace.",
      goToDashboard: "Go to the dashboard",
      sentGeneric: "We've sent an e-mail with a confirmation link.",
      sentToPrefix: "We've sent an e-mail with a confirmation link to",
      instructions:
        "Click the link, then sign in. If the e-mail doesn't arrive within a few minutes, check your spam folder or resend the link below.",
      googleNote:
        "If this address was previously used with Google, the e-mail may not arrive — in that case sign in with Google and set a password in the account settings.",
      resent: "If this address is awaiting confirmation, we've sent the e-mail again. Check your spam folder too.",
      resendTitle: "Resend the link",
      emailLabel: "E-mail address",
      resendSubmit: "Send again",
      backToSignIn: "Back to sign-in",
    },
  },
  {
    or: "lub",
    googleButton: "Kontynuuj z Google",
    signin: {
      pageTitle: "Logowanie - SafeSpace",
      title: "Zaloguj się",
      intro: "Wybierz Google albo konto e-mail.",
      accountDeleted: "Konto zostało usunięte wraz z historią rozmów i pamięcią awatarów. Wylogowano Cię.",
      forgotPassword: "Nie pamiętasz hasła?",
      noAccount: "Nie masz konta?",
      createAccount: "Utwórz konto",
    },
    signup: {
      pageTitle: "Utwórz konto - SafeSpace",
      title: "Utwórz konto",
      intro: "Zarejestruj się przez Google lub e-mail. Potem wybierzesz perspektywę do pierwszej rozmowy.",
      haveAccount: "Masz już konto?",
      signIn: "Zaloguj się",
    },
    forgot: {
      pageTitle: "Zmiana hasła - SafeSpace",
      title: "Nie pamiętasz hasła?",
      intro: "Podaj adres e-mail konta, a wyślemy link do ustawienia nowego hasła.",
      sent: "Jeśli ten adres ma konto w SafeSpace, za chwilę dostaniesz wiadomość z linkiem do zmiany hasła. Sprawdź też folder ze spamem.",
      emailLabel: "Adres e-mail",
      submit: "Wyślij link do zmiany hasła",
      backToSignIn: "Wróć do logowania",
    },
    confirm: {
      headingSignedIn: "Konto jest aktywne",
      headingInbox: "Sprawdź skrzynkę",
      pageTitle: (heading) => `${heading} - SafeSpace`,
      signedInBody: "Możesz przejść do prywatnej części SafeSpace.",
      goToDashboard: "Przejdź do panelu",
      sentGeneric: "Wysłaliśmy wiadomość z linkiem potwierdzającym.",
      sentToPrefix: "Wysłaliśmy wiadomość z linkiem potwierdzającym na adres",
      instructions:
        "Kliknij link, a potem zaloguj się. Jeśli wiadomość nie dotrze w kilka minut, sprawdź folder ze spamem albo wyślij link ponownie poniżej.",
      googleNote:
        "Jeśli ten adres był wcześniej użyty z Google, wiadomość może nie przyjść — wtedy zaloguj się przez Google i ustaw hasło w ustawieniach konta.",
      resent: "Jeśli ten adres czeka na potwierdzenie, wysłaliśmy wiadomość ponownie. Sprawdź też folder ze spamem.",
      resendTitle: "Wyślij link ponownie",
      emailLabel: "Adres e-mail",
      resendSubmit: "Wyślij ponownie",
      backToSignIn: "Wróć do logowania",
    },
  },
);

export function getAuthPagesCopy(locale: Locale) {
  return AUTH_PAGES_COPY[locale];
}
