import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapPasswordUpdateError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 6;
const SECURITY_PATH = "/account/security";

function getFormString(form: FormData, field: string, trim = true) {
  const value = form.get(field);
  if (typeof value !== "string") {
    return "";
  }

  return trim ? value.trim() : value;
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "auth_not_configured"), 303);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect("/auth/signin", 303);
  }

  const form = await context.request.formData();
  const password = getFormString(form, "password", false);
  const confirmPassword = getFormString(form, "confirmPassword", false);

  if (!password) {
    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "missing_password"), 303);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "password_too_short"), 303);
  }

  if (password !== confirmPassword) {
    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "passwords_do_not_match"), 303);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, mapPasswordUpdateError(error)), 303);
  }

  return context.redirect(`${SECURITY_PATH}?status=password_updated`, 303);
};
