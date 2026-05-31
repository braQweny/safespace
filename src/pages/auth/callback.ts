import type { APIRoute } from "astro";
import { getAuthErrorRedirect } from "@/lib/auth-errors";
import { AUTHENTICATED_REDIRECT_PATH } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const providerError = context.url.searchParams.get("error");
  const code = context.url.searchParams.get("code");

  if (providerError || !code) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_callback_failed"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "oauth_callback_failed"));
  }

  return context.redirect(AUTHENTICATED_REDIRECT_PATH);
};
