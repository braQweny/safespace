import type { APIRoute } from "astro";
import { mapSignInError } from "@/lib/auth-errors";
import { createAuthRoute } from "@/lib/auth-route";
import { getSafeAuthRedirect } from "@/lib/auth-redirect";
import { EMAIL_PATTERN, getFormString } from "@/lib/auth-validation";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.signin");
  const form = await context.request.formData();
  const email = getFormString(form, "email");
  const password = getFormString(form, "password", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    return route.failureRedirect("/auth/signin", "invalid_email");
  }

  if (!password) {
    return route.failureRedirect("/auth/signin", "missing_password");
  }

  if (!route.supabase) {
    return route.failureRedirect("/auth/signin", "auth_not_configured", { level: "error", provider: "supabase" });
  }

  const { error } = await route.supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return route.failureRedirect("/auth/signin", mapSignInError(error), { provider: "supabase" });
  }

  return route.successRedirect(redirectTo);
};
