import type { APIRoute } from "astro";
import { createAuthRoute, readFormData } from "@/lib/auth-route";
import { clearAuthCookies } from "@/lib/supabase";

export const prerender = false;

const DELETE_PATH = "/account/delete";

export const POST: APIRoute = async (context) => {
  // Explicitly require a same-origin form, including when called outside Astro's
  // built-in form CSRF guard. Missing Origin is not sufficient authorization.
  if (context.request.headers.get("origin") !== context.url.origin) {
    return new Response(null, { status: 403 });
  }

  const route = await createAuthRoute(context, "auth.account_delete");
  if (!context.locals.user) {
    return context.redirect("/auth/signin", 303);
  }
  if (!route.supabase) {
    return route.failureRedirect(DELETE_PATH, "account_deletion_failed", { provider: "supabase" });
  }

  const form = await readFormData(context.request);
  if (form.get("confirmation") !== "USUWAM") {
    return route.failureRedirect(DELETE_PATH, "account_deletion_confirmation_required");
  }

  // A blocked account keeps the right to erase its data. Ownership is enforced
  // again in SQL using auth.uid(), never an id supplied by this request.
  try {
    const result = await route.supabase.rpc("delete_own_account", { p_confirmation: "USUWAM" });
    if (result.error || result.data !== true) {
      return route.failureRedirect(DELETE_PATH, "account_deletion_failed", { provider: "supabase" });
    }
  } catch {
    return route.failureRedirect(DELETE_PATH, "account_deletion_failed", { provider: "supabase" });
  }

  // Auth sessions have already been deleted atomically with the account. Clear
  // browser credentials even if the Auth service is temporarily unreachable.
  try {
    await route.supabase.auth.signOut({ scope: "local" });
  } catch {
    // Cookie cleanup below does not depend on an additional network request.
  }
  clearAuthCookies(context.request.headers, context.cookies);
  context.locals.user = null;
  return route.successRedirect("/auth/signin?status=account_deleted");
};
