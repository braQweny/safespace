import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { GOOGLE_AUTH_PROVIDER } from "@/lib/auth-providers";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"), 303);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: GOOGLE_AUTH_PROVIDER.provider,
    options: {
      redirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error || !data.url) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_start_failed"), 303);
  }

  return context.redirect(data.url, 303);
};
