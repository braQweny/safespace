import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { GOOGLE_AUTH_PROVIDER } from "@/lib/auth-providers";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const operationalContext = await buildOperationalRequestContext(context);
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.oauth_start",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "auth_not_configured",
        provider: "google",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"), 303);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: GOOGLE_AUTH_PROVIDER.provider,
    options: {
      redirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error || !data.url) {
    logOperationalEvent(
      {
        event: "auth.oauth_start",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "oauth_start_failed",
        provider: "google",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_start_failed"), 303);
  }

  logOperationalEvent(
    {
      event: "auth.oauth_start",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "google",
    },
    operationalContext,
  );

  return context.redirect(data.url, 303);
};
