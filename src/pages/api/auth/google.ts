import type { APIRoute } from "astro";
import { createAuthRoute } from "@/lib/auth-route";
import { GOOGLE_AUTH_PROVIDER } from "@/lib/auth-providers";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.oauth_start");

  if (!route.supabase) {
    return route.failureRedirect("/auth/signin", "auth_not_configured", { level: "error", provider: "google" });
  }

  const { data, error } = await route.supabase.auth.signInWithOAuth({
    provider: GOOGLE_AUTH_PROVIDER.provider,
    options: {
      redirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error || !data.url) {
    return route.failureRedirect("/auth/signin", "oauth_start_failed", { provider: "google" });
  }

  return route.successRedirect(data.url, { provider: "google" });
};
