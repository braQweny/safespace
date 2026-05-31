import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapSignInError } from "@/lib/auth-errors";
import { getSafeAuthRedirect } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getFormString(form: FormData, field: string, trim = true) {
  const value = form.get(field);
  if (typeof value !== "string") {
    return "";
  }

  return trim ? value.trim() : value;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = getFormString(form, "email");
  const password = getFormString(form, "password", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "invalid_email"), 303);
  }

  if (!password) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "missing_password"), 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"), 303);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(getAuthErrorRedirect("/auth/signin", mapSignInError(error)), 303);
  }

  return context.redirect(redirectTo, 303);
};
