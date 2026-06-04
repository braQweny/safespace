export const AVATAR_CHOICE_ERROR_PARAM = "avatarError";

const AVATAR_CHOICE_ERROR_MESSAGES = {
  missing_auth: "Zaloguj sie, zeby wybrac awatara.",
  invalid_choice: "Ten wybor awatara jest niedostepny. Wybierz jedna z widocznych opcji.",
  config_unavailable: "Zapisywanie wyboru jest chwilowo niedostepne. Sprobuj ponownie pozniej.",
  fetch_failed: "Nie udalo sie pobrac zapisanego wyboru. Mozesz sprobowac ponownie za chwile.",
  save_failed: "Nie udalo sie zapisac wyboru. Sprobuj ponownie za chwile.",
} as const;

export type AvatarChoiceErrorCode = keyof typeof AVATAR_CHOICE_ERROR_MESSAGES;

export function getAvatarChoiceErrorMessage(code: AvatarChoiceErrorCode) {
  return AVATAR_CHOICE_ERROR_MESSAGES[code];
}

export function parseAvatarChoiceErrorCode(value: unknown): AvatarChoiceErrorCode | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value in AVATAR_CHOICE_ERROR_MESSAGES) {
    return value as AvatarChoiceErrorCode;
  }

  return null;
}

export function getAvatarChoiceErrorRedirect(pathname: string, code: AvatarChoiceErrorCode) {
  const searchParams = new URLSearchParams({ [AVATAR_CHOICE_ERROR_PARAM]: code });
  return `${pathname}?${searchParams.toString()}`;
}
