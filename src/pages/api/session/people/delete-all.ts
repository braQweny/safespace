import type { APIRoute } from "astro";
import { getFormString, readFormData } from "@/lib/auth-validation";
import { getAccountAccessRedirectPath } from "@/lib/request-guards";
import { disableAndDeleteOwnedPeopleMemory } from "@/lib/session-data/repository";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

const SECURITY_PATH = "/account/security";

function statusRedirect(context: Parameters<APIRoute>[0], status: string) {
  return context.redirect(`${SECURITY_PATH}?people=${status}#people-memory`, 303);
}

/**
 * „Wyłącz i usuń wszystkie karty” — natywny formularz (CSRF przez `checkOrigin`),
 * potwierdzenie jako wymagane pole wyboru. Działa niezależnie od flagi: dane
 * zapisane wcześniej zawsze da się usunąć. Bez logowania i bez limitera.
 */
export const POST: APIRoute = async (context) => {
  const access = await requireSessionRouteAccess(context);
  if (!access.ok) {
    if (access.error.code === "missing_auth") return context.redirect("/auth/signin", 303);
    if (access.error.source === "account_access") {
      return context.redirect(getAccountAccessRedirectPath(access.error.code), 303);
    }
    return statusRedirect(context, "delete_failed");
  }

  const form = await readFormData(context.request);
  if (getFormString(form, "confirm") !== "1") return statusRedirect(context, "delete_confirmation_required");

  const deleted = await disableAndDeleteOwnedPeopleMemory(access.data);
  return statusRedirect(context, deleted.ok && deleted.data ? "deleted" : "delete_failed");
};
