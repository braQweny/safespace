import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapPasswordUpdateError } from "@/lib/auth-errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
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
  const operationalContext = await buildOperationalRequestContext(context);
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "auth_not_configured"), 303);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_auth",
      },
      operationalContext,
    );

    return context.redirect("/auth/signin", 303);
  }

  const form = await context.request.formData();
  const password = getFormString(form, "password", false);
  const confirmPassword = getFormString(form, "confirmPassword", false);

  if (!password) {
    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_password",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "missing_password"), 303);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "password_too_short",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "password_too_short"), 303);
  }

  if (password !== confirmPassword) {
    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "passwords_do_not_match",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, "passwords_do_not_match"), 303);
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const reasonCode = mapPasswordUpdateError(error);

    logOperationalEvent(
      {
        event: "auth.password_update",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode,
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(SECURITY_PATH, reasonCode), 303);
  }

  logOperationalEvent(
    {
      event: "auth.password_update",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "supabase",
    },
    operationalContext,
  );

  return context.redirect(`${SECURITY_PATH}?status=password_updated`, 303);
};
