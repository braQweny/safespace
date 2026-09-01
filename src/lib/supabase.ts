import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

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
