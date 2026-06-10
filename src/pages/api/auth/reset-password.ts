import type { APIRoute } from "astro";
import { getAuthErrorRedirect, mapResetPasswordError } from "@/lib/auth-errors";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { EMAIL_PATTERN, getFormString } from "@/lib/auth-validation";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";

// After the recovery link signs the user in, the auth callback sends them
// straight to the password form instead of the dashboard.
const RECOVERY_NEXT_PATH = "/account/security";

export const POST: APIRoute = async (context) => {
  const operationalContext = await buildOperationalRequestContext(context);
  const form = await context.request.formData();
  const email = getFormString(form, "email");

  if (!EMAIL_PATTERN.test(email)) {
    logOperationalEvent(
      {
        event: "auth.reset_password",
        level: "warn",
        outcome: "failure",
        status: 302,
        reasonCode: "invalid_email",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(FORGOT_PASSWORD_PATH, "invalid_email"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    logOperationalEvent(
      {
        event: "auth.reset_password",
        level: "error",
        outcome: "failure",
        status: 302,
        reasonCode: "auth_not_configured",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(FORGOT_PASSWORD_PATH, "auth_not_configured"));
  }

  const redirectTo = `${getAuthCallbackUrl(context.url.origin)}?next=${encodeURIComponent(RECOVERY_NEXT_PATH)}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    const code = mapResetPasswordError(error);

    logOperationalEvent(
      {
        event: "auth.reset_password",
        level: "warn",
        outcome: "failure",
        status: 302,
        reasonCode: code,
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAuthErrorRedirect(FORGOT_PASSWORD_PATH, code));
  }

  logOperationalEvent(
    {
      event: "auth.reset_password",
      level: "info",
      outcome: "success",
      status: 302,
      provider: "supabase",
    },
    operationalContext,
  );

  // Always end on the same confirmation regardless of whether the address has
  // an account — the response must not reveal account existence.
  return context.redirect(`${FORGOT_PASSWORD_PATH}?sent=1`);
};
