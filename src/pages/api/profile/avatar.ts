import type { APIRoute } from "astro";
import { getAvatarChoiceErrorRedirect } from "@/lib/avatar-choice-errors";
import { getValidAvatarChoice } from "@/lib/modalities";
import { createClient } from "@/lib/supabase";

function getFormString(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "config_unavailable"), 303);
  }

  const { user } = context.locals;

  if (!user) {
    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "missing_auth"), 303);
  }

  const form = await context.request.formData();
  const selectedChoice = getValidAvatarChoice(getFormString(form, "modalityId"), getFormString(form, "avatarId"));

  if (!selectedChoice) {
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
    return context.redirect(getAvatarChoiceErrorRedirect("/dashboard/avatar", "save_failed"), 303);
  }

  return context.redirect("/dashboard?avatar=updated", 303);
};
