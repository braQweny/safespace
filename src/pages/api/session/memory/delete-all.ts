import type { APIRoute } from "astro";
import { getFormString, readFormData } from "@/lib/auth-validation";
import { getAccountAccessRedirectPath } from "@/lib/request-guards";
import { disableAndDeleteOwnedPeopleMemory, disableAndDeleteOwnedTopicMap } from "@/lib/session-data/repository";
import { isMemoryDeleteScope, type MemorySettingsStatusCode } from "@/lib/session-flow/memory-contract";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

const SECURITY_PATH = "/account/security";

function statusRedirect(context: Parameters<APIRoute>[0], status: MemorySettingsStatusCode) {
  return context.redirect(`${SECURITY_PATH}?memory=${status}#memory`, 303);
}

/**
 * „Usuń zapisane karty” z karty „Pamięć rozmów”: jeden natywny formularz
 * (CSRF przez `checkOrigin`) dla osób, tematów albo obu, z potwierdzeniem jako
 * wymaganym polem wyboru. Działa niezależnie od flag: dane zapisane wcześniej
 * zawsze da się usunąć. Zakres „wszystko” usuwa osoby, a potem tematy; gdy
 * drugi krok padnie, status mówi o porażce, a pierwszy krok jest już trwały —
 * ponowienie usunie resztę. Bez logowania i bez limitera.
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
  const scope = getFormString(form, "scope");
  if (!isMemoryDeleteScope(scope)) return statusRedirect(context, "invalid_scope");
  if (getFormString(form, "confirm") !== "1") return statusRedirect(context, "delete_confirmation_required");

  if (scope === "people" || scope === "all") {
    const deleted = await disableAndDeleteOwnedPeopleMemory(access.data);
    if (!deleted.ok || !deleted.data) return statusRedirect(context, "delete_failed");
  }

  if (scope === "topics" || scope === "all") {
    const deleted = await disableAndDeleteOwnedTopicMap(access.data);
    if (!deleted.ok || !deleted.data) return statusRedirect(context, "delete_failed");
  }

  return statusRedirect(
    context,
    scope === "people" ? "deleted_people" : scope === "topics" ? "deleted_topics" : "deleted_all",
  );
};
