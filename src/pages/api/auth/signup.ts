import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapSignUpError } from "@/lib/auth-errors";
import { getAuthCallbackUrl, getSafeAuthRedirect } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

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
  const confirmPassword = getFormString(form, "confirmPassword", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", "invalid_email"), 303);
  }

  if (!password) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", "missing_password"), 303);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", "password_too_short"), 303);
  }

  if (password !== confirmPassword) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", "passwords_do_not_match"), 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", "auth_not_configured"), 303);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error) {
    return context.redirect(getAuthErrorRedirect("/auth/signup", mapSignUpError(error)), 303);
  }

  if (data.session) {
    return context.redirect(redirectTo, 303);
  }

  return context.redirect("/auth/confirm-email", 303);
};
