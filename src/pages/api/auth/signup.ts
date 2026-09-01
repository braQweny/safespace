import type { APIRoute } from "astro";
import { mapSignUpError } from "@/lib/auth-errors";
import { createAuthRoute, readFormData } from "@/lib/auth-route";
import { getAuthCallbackUrl, getSafeAuthRedirect } from "@/lib/auth-redirect";
import { EMAIL_PATTERN, MIN_PASSWORD_LENGTH, getFormString } from "@/lib/auth-validation";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.signup");
  const form = await readFormData(context.request);
  const email = getFormString(form, "email");
  const password = getFormString(form, "password", false);
  const confirmPassword = getFormString(form, "confirmPassword", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    return route.failureRedirect("/auth/signup", "invalid_email");
  }

  if (!password) {
    return route.failureRedirect("/auth/signup", "missing_password");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return route.failureRedirect("/auth/signup", "password_too_short");
  }

  if (password !== confirmPassword) {
    return route.failureRedirect("/auth/signup", "passwords_do_not_match");
  }

  if (!route.supabase) {
    return route.failureRedirect("/auth/signup", "auth_not_configured", { level: "error", provider: "supabase" });
  }

  const { data, error } = await route.supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error) {
    return route.failureRedirect("/auth/signup", mapSignUpError(error), { provider: "supabase" });
  }

  return route.successRedirect(data.session ? redirectTo : "/auth/confirm-email");
};
