import { getValidAvatarChoice, toSelectedModalityAvatar, type ModalityAvatar } from "@/lib/modalities";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import type { SessionDataContext } from "@/lib/session-data/types";

export type CurrentAvatarChoiceErrorCode = "missing_avatar" | "invalid_avatar_choice" | "fetch_failed";

export type CurrentAvatarChoiceResult =
  | {
      ok: true;
      data: CurrentAvatarChoice;
    }
  | {
      ok: false;
      error: {
        code: CurrentAvatarChoiceErrorCode;
      };
    };

export interface CurrentAvatarChoice {
  modality: ModalityAvatar;
  selected: SelectedModalityAvatar;
}

interface AvatarChoiceRow {
  modality_id: string | null;
  avatar_id: string | null;
}

export interface AvatarChoiceRepository {
  readCurrentAvatarChoiceRow(context: SessionDataContext): Promise<AvatarChoiceRow | null>;
}

const defaultAvatarChoiceRepository: AvatarChoiceRepository = {
  async readCurrentAvatarChoiceRow(context) {
    const { data, error } = await context.supabase
      .from("user_avatar_choices")
      .select("modality_id, avatar_id")
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (error) {
      throw new Error("avatar_choice_fetch_failed");
    }

    return data ?? null;
  },
};

function avatarChoiceError(code: CurrentAvatarChoiceErrorCode): CurrentAvatarChoiceResult {
  return {
    ok: false,
    error: {
      code,
    },
  };
}

export async function readCurrentAvatarChoice(
  context: SessionDataContext,
  repository: AvatarChoiceRepository = defaultAvatarChoiceRepository,
): Promise<CurrentAvatarChoiceResult> {
  let row: AvatarChoiceRow | null;

  try {
    row = await repository.readCurrentAvatarChoiceRow(context);
  } catch {
    return avatarChoiceError("fetch_failed");
  }

  if (!row) {
    return avatarChoiceError("missing_avatar");
  }

  const modality = getValidAvatarChoice(row.modality_id, row.avatar_id);

  if (!modality) {
    return avatarChoiceError("invalid_avatar_choice");
  }

  return {
    ok: true,
    data: {
      modality,
      selected: toSelectedModalityAvatar(modality),
    },
  };
}
