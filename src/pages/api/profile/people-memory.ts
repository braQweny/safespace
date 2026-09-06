import type { APIRoute } from "astro";
import { getFormString, readFormData } from "@/lib/auth-validation";
import { getAccountAccessRedirectPath } from "@/lib/request-guards";
import { setOwnedPeopleMemoryEnabled } from "@/lib/session-data/repository";
import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";

export const prerender = false;

const SECURITY_PATH = "/account/security";

function statusRedirect(context: Parameters<APIRoute>[0], status: string) {
  return context.redirect(`${SECURITY_PATH}?people=${status}#people-memory`, 303);
}

/**
 * Przełącznik „Zapamiętuj osoby z rozmów”. Natywny formularz bez JS; zapis
 * idzie przez RPC, które przy wyłączeniu odłącza karty od trwających rozmów, a
 * przy włączeniu przewija kursory („od teraz”). Nie fail-open: nieudany zapis
 * wraca ze statusem, bo preferencja prywatności musi być zapisana naprawdę.
 * Włączanie jest zablokowane przy wyłączonej fladze; wyłączanie działa zawsze.
 */
export const POST: APIRoute = async (context) => {
  const form = await readFormData(context.request);
  const enabled = getFormString(form, "enabled");
  if (enabled !== "1" && enabled !== "0") return context.redirect(SECURITY_PATH, 303);

  const access = await requireSessionRouteAccess(context);
  if (!access.ok) {
    if (access.error.code === "missing_auth") return context.redirect("/auth/signin", 303);
    if (access.error.source === "account_access") {
      return context.redirect(getAccountAccessRedirectPath(access.error.code), 303);
    }
    return statusRedirect(context, "save_failed");
  }

  const wantsEnabled = enabled === "1";
  if (wantsEnabled && !isPeopleMemoryEnabled()) return statusRedirect(context, "unavailable");

  const saved = await setOwnedPeopleMemoryEnabled(access.data, wantsEnabled);
  return statusRedirect(context, saved.ok && saved.data ? "saved" : "save_failed");
};
