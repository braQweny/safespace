import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { AUTHENTICATED_REDIRECT_PATH } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

// Exact-match allowlist for the post-callback destination; anything else
// (including attacker-supplied values) falls back to the dashboard.
const SAFE_NEXT_PATHS = new Set(["/account/security"]);

function getSafeNextPath(nextParam: string | null) {
  return nextParam && SAFE_NEXT_PATHS.has(nextParam) ? nextParam : AUTHENTICATED_REDIRECT_PATH;
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);
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
