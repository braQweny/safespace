import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { getBillingConfig } from "@/lib/billing/config";
import { prepareBillingAccountDeletion } from "@/lib/billing/service";
import { ACCOUNT_DELETION_RPC_CONFIRMATION, isAccountDeletionConfirmation } from "@/lib/account-deletion";
import { createAuthRoute, readFormData } from "@/lib/auth-route";
import { getFormString } from "@/lib/auth-validation";
import { clearAuthCookies } from "@/lib/supabase";
import { checkSessionRateLimit } from "@/lib/rate-limit";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildSessionVoiceObserverEvent } from "@/lib/operational-visibility/session-events";
import { eraseVoiceObservers, listVoiceObserversToErase } from "@/lib/session-flow/voice-account-erasure";

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
  // Słowo z języka ekranu — dowolnego, bo język mógł się zmienić między
  // wczytaniem formularza a wysłaniem; funkcja bazy dostaje stały kontrakt.
  if (!isAccountDeletionConfirmation(getFormString(form, "confirmation", false))) {
    return route.failureRedirect(DELETE_PATH, "account_deletion_confirmation_required");
  }

  // Voice observers (Durable Objects) live outside the database cascade. Their
  // sessions are listed before the rows disappear and erased (hangup + purge)
  // only after the account is gone, so a failed deletion disturbs nothing.
  // Best-effort and bounded: a failed or slow observer never blocks the
  // deletion — its alarm still hangs up after heartbeat loss and purges the
  // buffer 7 days after closing. `null` = the list could not be read.
  let voiceSessionIds: string[] | null = [];

  // A blocked account keeps the right to erase its data. Ownership is enforced
  // again in SQL using auth.uid(), never an id supplied by this request.
  try {
    const billing = getBillingConfig();
    if (billing) {
      const verdict = await checkSessionRateLimit(env.BILLING_RATE_LIMITER, `billing:${context.locals.user.id}`, {
        failClosed: true,
      });
      if (verdict !== "allowed") {
        return route.failureRedirect(DELETE_PATH, verdict === "limited" ? "rate_limited" : "account_deletion_failed");
      }
      await prepareBillingAccountDeletion(billing, context.locals.user.id);
    }
    voiceSessionIds = await listVoiceObserversToErase({
      supabase: route.supabase,
      user: { id: context.locals.user.id },
    });
    // When disabled, SQL still refuses deletion of any unresolved billing account.
    const result = await route.supabase.rpc("delete_own_account", {
      p_confirmation: ACCOUNT_DELETION_RPC_CONFIRMATION,
    });
    if (result.error || result.data !== true) {
      return route.failureRedirect(DELETE_PATH, "account_deletion_failed", { provider: "supabase" });
    }
  } catch {
    return route.failureRedirect(DELETE_PATH, "account_deletion_failed", { provider: "supabase" });
  }

  const voiceObserversErased = voiceSessionIds !== null && (await eraseVoiceObservers(voiceSessionIds));
  if (!voiceObserversErased) {
    // No ids, no counts: only that some observer may keep its buffer until its own purge.
    logOperationalEvent(
      buildSessionVoiceObserverEvent({ outcome: "failure", reasonCode: "observer_hangup_failed", provider: "openai" }),
      route.operationalContext,
    );
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
