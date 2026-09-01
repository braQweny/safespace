import type { APIRoute } from "astro";
import { requireActiveAccountAccess } from "@/lib/admin/account-access";
import { mapPasswordUpdateError } from "@/lib/auth-errors";
import { createAuthRoute, readFormData } from "@/lib/auth-route";
import { MIN_PASSWORD_LENGTH, getFormString } from "@/lib/auth-validation";
import { getAccountAccessRedirectPath } from "@/lib/request-guards";

export const prerender = false;

const SECURITY_PATH = "/account/security";

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.password_update");

  if (!route.supabase) {
    return route.failureRedirect(SECURITY_PATH, "auth_not_configured", { level: "error", provider: "supabase" });
  }

  // The middleware resolves the user on every request; the security page that
  // hosts this form is itself a protected route.
  const { user } = context.locals;

  if (!user) {
    route.logFailure("missing_auth");
    return context.redirect("/auth/signin", 303);
  }

  // `/account/security` (the page) sits behind the middleware's block check,
  // but this API path does not, so the write has to gate itself the same way
  // the session routes do: a blocked account keeps its password as it is.
  const access = await requireActiveAccountAccess(context, route.supabase);

  if (!access.ok) {
    route.logFailure(access.error.code, {
      outcome: access.error.code === "account_blocked" ? "blocked" : "failure",
      provider: "supabase",
    });
    return context.redirect(getAccountAccessRedirectPath(access.error.code), 303);
  }

  const form = await readFormData(context.request);
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
