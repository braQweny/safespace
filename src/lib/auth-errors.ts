import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

const AUTH_ERROR_COPY = defineCopy(
  {
    account_deletion_failed: "We couldn't confirm the account deletion. Please try again in a moment.",
    account_deletion_confirmation_required: "To confirm deleting your account, type DELETE.",
    auth_not_configured: "Sign-in is temporarily unavailable. Please try again later.",
    invalid_email: "Enter a valid e-mail address.",
    missing_password: "Enter your password.",
    password_too_short: "The password must be at least 6 characters long.",
    passwords_do_not_match: "The passwords must match.",
    invalid_credentials: "We couldn't sign you in. Check your e-mail and password.",
    email_not_confirmed: "Confirm your e-mail address first, then sign in again.",
    rate_limited: "Too many attempts in a short time. Wait a moment and try again.",
    signin_failed: "We couldn't sign you in. Please try again in a moment.",
    signup_failed: "We couldn't create the account. Check the details or try again in a moment.",
    password_update_failed: "We couldn't set the password. Please try again in a moment.",
    signout_failed: "We couldn't sign you out. Please try again in a moment.",
    oauth_start_failed: "We couldn't start signing in with Google. Please try again in a moment.",
    oauth_callback_failed: "We couldn't finish signing you in. Please try again.",
    reset_password_failed: "We couldn't send the password reset link. Please try again in a moment.",
    resend_confirmation_failed: "We couldn't resend the confirmation link. Please try again in a moment.",
  },
  {
    account_deletion_failed: "Nie udało się potwierdzić usunięcia konta. Spróbuj ponownie za chwilę.",
    account_deletion_confirmation_required: "Aby potwierdzić usunięcie konta, wpisz USUWAM.",
    auth_not_configured: "Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.",
    invalid_email: "Podaj poprawny adres e-mail.",
    missing_password: "Podaj hasło.",
    password_too_short: "Hasło musi mieć co najmniej 6 znaków.",
    passwords_do_not_match: "Hasła muszą być takie same.",
    invalid_credentials: "Nie udało się zalogować. Sprawdź e-mail i hasło.",
    email_not_confirmed: "Najpierw potwierdź adres e-mail, a potem zaloguj się ponownie.",
    rate_limited: "Za dużo prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
    signin_failed: "Nie udało się zalogować. Spróbuj ponownie za chwilę.",
    signup_failed: "Nie udało się utworzyć konta. Sprawdź dane albo spróbuj ponownie za chwilę.",
    password_update_failed: "Nie udało się ustawić hasła. Spróbuj ponownie za chwilę.",
    signout_failed: "Nie udało się wylogować. Spróbuj ponownie za chwilę.",
    oauth_start_failed: "Nie udało się rozpocząć logowania przez Google. Spróbuj ponownie za chwilę.",
    oauth_callback_failed: "Nie udało się dokończyć logowania. Spróbuj ponownie.",
    reset_password_failed: "Nie udało się wysłać linku do zmiany hasła. Spróbuj ponownie za chwilę.",
    resend_confirmation_failed: "Nie udało się wysłać linku potwierdzającego ponownie. Spróbuj ponownie za chwilę.",
  },
);

export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY.en;

export const AUTH_ERROR_CODES = Object.keys(AUTH_ERROR_COPY.en) as readonly AuthErrorCode[];

interface SupabaseAuthLikeError {
  message?: string;
  status?: number;
  code?: string;
}

export function isAuthErrorCode(value: unknown): value is AuthErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(AUTH_ERROR_COPY.en, value);
}

export function getAuthErrorMessage(locale: Locale, code: AuthErrorCode) {
  return AUTH_ERROR_COPY[locale][code];
}

/** Trasy przekierowują z kodem w `?error=`; tekst rozwiązuje strona w swoim języku. */
export function getAuthErrorMessageFromSearchParam(locale: Locale, code: string | null) {
  if (!isAuthErrorCode(code)) {
    return null;
  }

  return getAuthErrorMessage(locale, code);
}

export function getAuthErrorRedirect(pathname: string, code: AuthErrorCode) {
  const searchParams = new URLSearchParams({ error: code });
  return `${pathname}?${searchParams.toString()}`;
}

export function mapSignInError(error: SupabaseAuthLikeError): AuthErrorCode {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("email not confirmed")) {
    return "email_not_confirmed";
  }

  if (message.includes("rate limit") || message.includes("too many")) {
    return "rate_limited";
  }

  if (error.status === 400 || message.includes("invalid") || message.includes("credentials")) {
    return "invalid_credentials";
  }

  return "signin_failed";
}

export function mapSignUpError(error: SupabaseAuthLikeError): AuthErrorCode {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("rate limit") || message.includes("too many")) {
    return "rate_limited";
  }

  return "signup_failed";
}

export function mapResetPasswordError(error: SupabaseAuthLikeError): AuthErrorCode {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("rate limit") || message.includes("too many")) {
    return "rate_limited";
  }

  return "reset_password_failed";
}

/**
 * Resending the confirmation link deliberately ends on the same page whatever
 * the provider answered (the response must not reveal whether the address
 * exists or is already confirmed), so this mapping only feeds the operational
 * log — `rate_limited` is the one outcome worth telling apart (HTTP 429 /
 * `over_email_send_rate_limit`).
 */
export function mapResendConfirmationError(error: SupabaseAuthLikeError): AuthErrorCode {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code?.toLowerCase() ?? "";

  if (
    error.status === 429 ||
    code.includes("rate_limit") ||
    message.includes("rate limit") ||
    message.includes("too many")
  ) {
    return "rate_limited";
  }

  return "resend_confirmation_failed";
}

export function mapPasswordUpdateError(error: SupabaseAuthLikeError): AuthErrorCode {
  const message = error.message?.toLowerCase() ?? "";

  if (message.includes("rate limit") || message.includes("too many")) {
    return "rate_limited";
  }

  return "password_update_failed";
}
