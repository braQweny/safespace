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
