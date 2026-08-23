import type { APIRoute } from "astro";
import { mapResendConfirmationError } from "@/lib/auth-errors";
import { createAuthRoute } from "@/lib/auth-route";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { EMAIL_PATTERN, getFormString } from "@/lib/auth-validation";

export const prerender = false;

const CONFIRM_EMAIL_PATH = "/auth/confirm-email";

// Every provider outcome ends here: the page must not reveal whether the
// address has an account or is already confirmed, so only validation and a
// missing Supabase config may show an error.
const RESENT_PATH = `${CONFIRM_EMAIL_PATH}?resent=1`;

export const POST: APIRoute = async (context) => {
  const route = await createAuthRoute(context, "auth.resend_confirmation");
  const form = await context.request.formData();
  const email = getFormString(form, "email");

  if (!EMAIL_PATTERN.test(email)) {
    return route.failureRedirect(CONFIRM_EMAIL_PATH, "invalid_email");
  }

  if (!route.supabase) {
    return route.failureRedirect(CONFIRM_EMAIL_PATH, "auth_not_configured", {
      level: "error",
      provider: "supabase",
    });
  }

  const { error } = await route.supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getAuthCallbackUrl(context.url.origin),
    },
  });

  if (error) {
    const reasonCode = mapResendConfirmationError(error);
    // Supabase throttles confirmation mails per address; the user sees the
    // same generic copy, the log keeps the distinction.
    route.logFailure(reasonCode, {
      provider: "supabase",
      outcome: reasonCode === "rate_limited" ? "blocked" : "failure",
    });
    return context.redirect(RESENT_PATH, 303);
  }

  return route.successRedirect(RESENT_PATH);
};
