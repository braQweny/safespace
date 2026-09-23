export const AUTHENTICATED_REDIRECT_PATH = "/dashboard";
export const AUTH_CALLBACK_PATH = "/auth/callback";

const SAFE_AUTH_REDIRECT_ORIGIN = "https://safespace.local";

export function isDashboardRoute(pathname: string) {
  return pathname === AUTHENTICATED_REDIRECT_PATH || pathname.startsWith(`${AUTHENTICATED_REDIRECT_PATH}/`);
}

export function getSafeAuthRedirect(target: unknown = null) {
  if (typeof target !== "string") {
    return AUTHENTICATED_REDIRECT_PATH;
  }

  const trimmedTarget = target.trim();
  if (!trimmedTarget.startsWith("/") || trimmedTarget.startsWith("//")) {
    return AUTHENTICATED_REDIRECT_PATH;
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(trimmedTarget, SAFE_AUTH_REDIRECT_ORIGIN);
  } catch {
    return AUTHENTICATED_REDIRECT_PATH;
  }

  if (parsedTarget.origin !== SAFE_AUTH_REDIRECT_ORIGIN || !isDashboardRoute(parsedTarget.pathname)) {
    return AUTHENTICATED_REDIRECT_PATH;
  }

  return `${parsedTarget.pathname}${parsedTarget.search}${parsedTarget.hash}`;
}

export function getAuthCallbackUrl(origin: string) {
  return new URL(AUTH_CALLBACK_PATH, origin).toString();
}

/** Strona konta z formularzem hasła; tu wraca też trasa zmiany hasła. */
export const ACCOUNT_SECURITY_PATH = "/account/security";

/**
 * `?password=recovery` renderuje zwinięty formularz „Zmień hasło” jako
 * otwarty, a `#change-password` przewija do niego. Link odzyskiwania hasła kończy
 * się tutaj — osoba, która nie pamięta hasła, nie szuka formularza na stronie.
 */
export const PASSWORD_FORM_PARAM = "password";
export const PASSWORD_RECOVERY_VALUE = "recovery";
export const PASSWORD_RECOVERY_LANDING_PATH = `${ACCOUNT_SECURITY_PATH}?${PASSWORD_FORM_PARAM}=${PASSWORD_RECOVERY_VALUE}#change-password`;
