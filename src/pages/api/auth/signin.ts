import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapSignInError } from "@/lib/auth-errors";
import { getSafeAuthRedirect } from "@/lib/auth-redirect";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
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
  const operationalContext = await buildOperationalRequestContext(context);
  const form = await context.request.formData();
  const email = getFormString(form, "email");
  const password = getFormString(form, "password", false);
  const redirectTo = getSafeAuthRedirect(form.get("redirectTo") ?? context.url.searchParams.get("redirectTo"));

  if (!EMAIL_PATTERN.test(email)) {
    logOperationalEvent(
      {
        event: "auth.signin",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_email",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "invalid_email"), 303);
  }

  if (!password) {
    logOperationalEvent(
      {
        event: "auth.signin",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_password",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "missing_password"), 303);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.signin",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", "auth_not_configured"), 303);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const reasonCode = mapSignInError(error);

    logOperationalEvent(
      {
        event: "auth.signin",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode,
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect("/auth/signin", reasonCode), 303);
  }

  logOperationalEvent(
    {
      event: "auth.signin",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "supabase",
    },
    operationalContext,
  );

  return context.redirect(redirectTo, 303);
};
