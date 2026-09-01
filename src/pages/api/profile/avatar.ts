import type { APIRoute } from "astro";
import { requireActiveAccountAccess } from "@/lib/admin/account-access";
import { getAvatarChoiceErrorRedirect } from "@/lib/avatar-choice-errors";
import { readFormData } from "@/lib/auth-route";
import { getFormString } from "@/lib/auth-validation";
import { getModalityById } from "@/lib/modalities";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import { getAccountAccessRedirectPath } from "@/lib/request-guards";
import { createClient } from "@/lib/supabase";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const operationalContext = await buildOperationalRequestContext(context);
  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    logOperationalEvent(
      {
        event: "avatar.save",
        level: "error",
        outcome: "failure",
        status: 303,
        reasonCode: "config_unavailable",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "config_unavailable"), 303);
  }

  const { user } = context.locals;

  if (!user) {
    logOperationalEvent(
      {
        event: "avatar.save",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "missing_auth",
      },
      operationalContext,
    );

    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "missing_auth"), 303);
  }

  // `/dashboard/avatar` (the page) sits behind the middleware's block check,
  // but this API path does not, so the write gates itself the same way the
  // session routes do.
  const access = await requireActiveAccountAccess(context, supabase);

  if (!access.ok) {
    logOperationalEvent(
      {
        event: "avatar.save",
        level: "warn",
        outcome: access.error.code === "account_blocked" ? "blocked" : "failure",
        status: 303,
        reasonCode: access.error.code,
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAccountAccessRedirectPath(access.error.code), 303);
  }

  const form = await readFormData(context.request);
  const selectedChoice = getModalityById(getFormString(form, "modalityId"));
  /*
   * Wybór perspektywy i start rozmowy to jedna decyzja („chcę rozmawiać z tą
   * osobą”), więc ekran wyboru oferuje też drugi przycisk. Sam start zostaje
   * tam, gdzie był — w panelu, na `/api/session/start*` z całą kontrolą puli i
   * limitów; ten endpoint tylko przekazuje intencję dalej adresem.
   */
  const shouldStartAfterSave = getFormString(form, "intent") === "save_and_start";

  if (!selectedChoice) {
    logOperationalEvent(
      {
        event: "avatar.save",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "invalid_choice",
      },
      operationalContext,
    );

    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "invalid_choice"), 303);
  }

  const { error } = await supabase.from("user_avatar_choices").upsert(
    {
      user_id: user.id,
      modality_id: selectedChoice.modalityId,
      avatar_id: selectedChoice.avatarId,
    },
    {
      onConflict: "user_id",
    },
  );

  if (error) {
    logOperationalEvent(
      {
        event: "avatar.save",
        level: "warn",
        outcome: "failure",
        status: 303,
        reasonCode: "save_failed",
        provider: "supabase",
      },
      operationalContext,
    );

    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "save_failed"), 303);
  }

  logOperationalEvent(
    {
      event: "avatar.save",
      level: "info",
      outcome: "success",
      status: 303,
      provider: "supabase",
    },
    operationalContext,
  );

  return context.redirect(shouldStartAfterSave ? "/dashboard?start=now" : "/dashboard?avatar=updated", 303);
};
