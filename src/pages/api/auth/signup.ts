import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapSignUpError } from "@/lib/auth-errors";
import { getAuthCallbackUrl, getSafeAuthRedirect } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
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
  const operationalContext = await buildOperationalRequestContext(context);
  const form = await context.request.formData();
  const email = getFormString(form, "email");
  const password = getFormString(form, "password", false);
  const confirmPassword = getFormString(form, "confirmPassword", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    logOperationalEvent(
      {
        event: "auth.signup",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_email",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signup", "invalid_email"), 303);
  }

  if (!password) {
    logOperationalEvent(
      {
        event: "auth.signup",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_password",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signup", "missing_password"), 303);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    logOperationalEvent(
      {
        event: "auth.signup",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "password_too_short",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signup", "password_too_short"), 303);
  }

  if (password !== confirmPassword) {
    logOperationalEvent(
      {
        event: "auth.signup",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "passwords_do_not_match",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signup", "passwords_do_not_match"), 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.signup",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );

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
    const reasonCode = mapSignUpError(error);

    logOperationalEvent(
      {
        event: "auth.signup",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode,
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signup", reasonCode), 303);
  }

  logOperationalEvent(
    {
      event: "auth.signup",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "supabase",
    },
    operationalContext,
  );

  if (data.session) {
    return context.redirect(redirectTo, 303);
  }

  return context.redirect("/auth/confirm-email", 303);
};
