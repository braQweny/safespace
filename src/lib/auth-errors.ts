const AUTH_ERROR_MESSAGES = {
  auth_not_configured: "Logowanie jest chwilowo niedostepne. Sprobuj ponownie pozniej.",
  invalid_email: "Podaj poprawny adres e-mail.",
  missing_password: "Podaj haslo.",
  password_too_short: "Haslo musi miec co najmniej 6 znakow.",
  passwords_do_not_match: "Hasla musza byc takie same.",
  invalid_credentials: "Nie udalo sie zalogowac. Sprawdz e-mail i haslo.",
  email_not_confirmed: "Najpierw potwierdz adres e-mail, a potem zaloguj sie ponownie.",
  rate_limited: "Za duzo prob w krotkim czasie. Odczekaj chwile i sprobuj ponownie.",
  signin_failed: "Nie udalo sie zalogowac. Sprobuj ponownie za chwile.",
  signup_failed: "Nie udalo sie utworzyc konta. Sprawdz dane albo sprobuj ponownie za chwile.",
  oauth_start_failed: "Nie udalo sie rozpoczac logowania przez Google. Sprobuj ponownie za chwile.",
  oauth_callback_failed: "Nie udalo sie dokonczyc logowania. Sprobuj ponownie.",
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MESSAGES;

interface SupabaseAuthLikeError {
  message?: string;
  status?: number;
}

export function getAuthErrorMessage(code: AuthErrorCode) {
  return AUTH_ERROR_MESSAGES[code];
}

export function getAuthErrorRedirect(pathname: string, code: AuthErrorCode) {
  const searchParams = new URLSearchParams({ error: getAuthErrorMessage(code) });
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
