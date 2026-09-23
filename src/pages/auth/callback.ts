import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import {
  ACCOUNT_SECURITY_PATH,
  AUTHENTICATED_REDIRECT_PATH,
  PASSWORD_RECOVERY_LANDING_PATH,
} from "@/lib/auth-redirect";
import { syncLocaleAfterSignIn } from "@/lib/i18n/account-locale";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

// Exact-match allowlist for the post-callback destination; anything else
// (including attacker-supplied values) falls back to the dashboard. The only
// `next` comes from the password-recovery link (`reset-password.ts`), and it
// lands on the account page with the password form already open — the
// Supabase-facing redirect URL stays unchanged, so links already sitting in
// inboxes get the open form too.
const SAFE_NEXT_DESTINATIONS: ReadonlyMap<string, string> = new Map([
  [ACCOUNT_SECURITY_PATH, PASSWORD_RECOVERY_LANDING_PATH],
]);

function getSafeNextPath(nextParam: string | null) {
  const destination = nextParam === null ? undefined : SAFE_NEXT_DESTINATIONS.get(nextParam);

  return destination ?? AUTHENTICATED_REDIRECT_PATH;
}

export const GET: APIRoute = async (context) => {
  const operationalContext = await buildOperationalRequestContext(context);
  const providerError = context.url.searchParams.get("error");
  const code = context.url.searchParams.get("code");

  if (providerError || !code) {
    logOperationalEvent(
      {
        event: "auth.oauth_callback",
        level: "warn",
        outcome: "failure",
        status: 302,
        reasonCode: "oauth_callback_failed",
        provider: "google",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_callback_failed"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.oauth_callback",
        level: "error",
        outcome: "failure",
        status: 302,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"));
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    logOperationalEvent(
      {
        event: "auth.oauth_callback",
        level: "warn",
        outcome: "failure",
        status: 302,
        reasonCode: "oauth_callback_failed",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_callback_failed"));
  }

  // Google, potwierdzenie e-maila i odzyskiwanie hasła lądują tutaj — jedno
  // miejsce, w którym język z konta trafia do cookie tego urządzenia.
  await syncLocaleAfterSignIn(context, supabase, data.user);

  logOperationalEvent(
    {
      event: "auth.oauth_callback",
      level: "info",
      outcome: "success",
      status: 302,
      provider: "supabase",
    },
    operationalContext,
  );

  return context.redirect(getSafeNextPath(context.url.searchParams.get("next")));
};
