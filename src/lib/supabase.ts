import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

export function clearAuthCookies(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL) return;
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  // The middleware may have refreshed cookies during this same request. Include
  // newly written chunks as well as the original request's cookie names.
  const names = new Set([
    ...parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name }) => name),
    ...Array.from(cookies.headers(), (header) => header.slice(0, header.indexOf("="))),
  ]);
  for (const name of names) {
    if (name === storageKey || name.startsWith(`${storageKey}.`) || name.startsWith(`${storageKey}-`)) {
      cookies.delete(name, { path: "/" });
    }
  }
}

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    // The SSR helper defaults to `sameSite: "lax"` but leaves `secure` off;
    // the production site is HTTPS-only (HSTS), so the auth cookies must never
    // be sent over plain HTTP. Local `astro dev` runs on http://localhost,
    // hence the build-mode switch. Other defaults (path, sameSite, maxAge)
    // are kept — the options object is merged over them, not replacing them.
    cookieOptions: { secure: import.meta.env.PROD },
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value,
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
