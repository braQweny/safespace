const AUTH_ERROR_MESSAGES = {
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
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

interface SupabaseAuthLikeError {
  message?: string;
  status?: number;
  code?: string;
}

export function getAuthErrorMessage(code: AuthErrorCode) {
  return AUTH_ERROR_MESSAGES[code];
}

export function getAuthErrorMessageFromSearchParam(code: string | null) {
  if (!code || !Object.prototype.hasOwnProperty.call(AUTH_ERROR_MESSAGES, code)) {
    return null;
  }

  return getAuthErrorMessage(code as AuthErrorCode);
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
