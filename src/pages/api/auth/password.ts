import type { APIRoute } from "astro";
import { mapPasswordUpdateError } from "@/lib/auth-errors";
import { createAuthRoute } from "@/lib/auth-route";
import { MIN_PASSWORD_LENGTH, getFormString } from "@/lib/auth-validation";

export const prerender = false;

const SECURITY_PATH = "/account/security";

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.password_update");

  if (!route.supabase) {
    return route.failureRedirect(SECURITY_PATH, "auth_not_configured", { level: "error", provider: "supabase" });
  }

  const {
    data: { user },
  } = await route.supabase.auth.getUser();

  if (!user) {
    route.logFailure("missing_auth");
    return context.redirect("/auth/signin", 303);
  }

  const form = await context.request.formData();
  const password = getFormString(form, "password", false);
  const confirmPassword = getFormString(form, "confirmPassword", false);

  if (!password) {
    return route.failureRedirect(SECURITY_PATH, "missing_password");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return route.failureRedirect(SECURITY_PATH, "password_too_short");
  }

  if (password !== confirmPassword) {
    return route.failureRedirect(SECURITY_PATH, "passwords_do_not_match");
  }

  const { error } = await route.supabase.auth.updateUser({ password });

  if (error) {
    return route.failureRedirect(SECURITY_PATH, mapPasswordUpdateError(error), { provider: "supabase" });
  }

  return route.successRedirect(`${SECURITY_PATH}?status=password_updated`);
};
