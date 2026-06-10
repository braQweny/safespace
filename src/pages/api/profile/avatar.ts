import type { APIRoute } from "astro";
import { getAvatarChoiceErrorRedirect } from "@/lib/avatar-choice-errors";
import { getFormString } from "@/lib/auth-validation";
import { getModalityById } from "@/lib/modalities";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
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

  const form = await context.request.formData();
  const selectedChoice = getModalityById(getFormString(form, "modalityId"));

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

  return context.redirect("/dashboard?avatar=updated", 303);
};
