import type { APIRoute } from "astro";
import { mapResetPasswordError } from "@/lib/auth-errors";
import { createAuthRoute } from "@/lib/auth-route";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { EMAIL_PATTERN, getFormString } from "@/lib/auth-validation";

export const prerender = false;

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";

// After the recovery link signs the user in, the auth callback sends them
// straight to the password form instead of the dashboard.
const RECOVERY_NEXT_PATH = "/account/security";

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.reset_password");
  const form = await context.request.formData();
  const email = getFormString(form, "email");

  if (!EMAIL_PATTERN.test(email)) {
    return route.failureRedirect(FORGOT_PASSWORD_PATH, "invalid_email", { status: 302 });
  }

  if (!route.supabase) {
    return route.failureRedirect(FORGOT_PASSWORD_PATH, "auth_not_configured", {
      level: "error",
      provider: "supabase",
      status: 302,
    });
  }

  const redirectTo = `${getAuthCallbackUrl(context.url.origin)}?next=${encodeURIComponent(RECOVERY_NEXT_PATH)}`;
  const { error } = await route.supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return route.failureRedirect(FORGOT_PASSWORD_PATH, mapResetPasswordError(error), {
      provider: "supabase",
      status: 302,
    });
  }

  // Always end on the same confirmation regardless of whether the address has
  // an account — the response must not reveal account existence.
  return route.successRedirect(`${FORGOT_PASSWORD_PATH}?sent=1`, { status: 302 });
};
