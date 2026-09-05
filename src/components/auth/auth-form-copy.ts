import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

/**
 * Etykiety i walidacja kliencka trzech formularzy auth. Znaczenia błędów
 * pokrywają się z kodami `auth-errors.ts`, ale to osobne zdania — mówią do
 * osoby przy polu, nie po redirectcie.
 */
const AUTH_FORM_COPY = defineCopy(
  {
    emailLabel: "E-mail",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Your password",
    newPasswordLabel: "New password",
    newPasswordPlaceholder: "Enter a new password",
    repeatPasswordLabel: "Repeat password",
    repeatPasswordPlaceholder: "Enter the password again",
    errors: {
      emailRequired: "Enter your e-mail address",
      emailInvalid: "Enter a valid e-mail address",
      passwordRequired: "Enter a password",
      passwordTooShort: (minLength: number) => `The password must be at least ${minLength} characters long`,
      confirmRequired: "Repeat the password",
      passwordsMismatch: "The passwords must match",
    },
    hints: {
      missingChars: (count: number) => `${count} more characters needed`,
      minChars: (minLength: number) => `At least ${minLength} characters.`,
    },
    signInPending: "Signing in...",
    signIn: "Sign in",
    signUpPending: "Creating the account...",
    signUp: "Create an account",
    savePending: "Saving...",
    savePassword: "Save the password",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  {
    emailLabel: "E-mail",
    emailPlaceholder: "ty@example.com",
    passwordLabel: "Hasło",
    passwordPlaceholder: "Twoje hasło",
    newPasswordLabel: "Nowe hasło",
    newPasswordPlaceholder: "Wpisz nowe hasło",
    repeatPasswordLabel: "Powtórz hasło",
    repeatPasswordPlaceholder: "Wpisz hasło ponownie",
    errors: {
      emailRequired: "Podaj adres e-mail",
      emailInvalid: "Podaj poprawny adres e-mail",
      passwordRequired: "Podaj hasło",
      passwordTooShort: (minLength) => `Hasło musi mieć co najmniej ${minLength} znaków`,
      confirmRequired: "Powtórz hasło",
      passwordsMismatch: "Hasła muszą być takie same",
    },
    hints: {
      missingChars: (count) => `Brakuje znaków: ${count}`,
      minChars: (minLength) => `Co najmniej ${minLength} znaków.`,
    },
    signInPending: "Logowanie...",
    signIn: "Zaloguj się",
    signUpPending: "Tworzenie konta...",
    signUp: "Utwórz konto",
    savePending: "Zapisywanie...",
    savePassword: "Zapisz hasło",
    showPassword: "Pokaż hasło",
    hidePassword: "Ukryj hasło",
  },
);

export function getAuthFormCopy(locale: Locale) {
  return AUTH_FORM_COPY[locale];
}
