export const AVATAR_CHOICE_ERROR_PARAM = "avatarError";

const AVATAR_CHOICE_ERROR_MESSAGES = {
  missing_auth: "Zaloguj się, żeby wybrać awatara.",
  invalid_choice: "Ten wybór awatara jest niedostępny. Wybierz jedną z widocznych opcji.",
  config_unavailable: "Zapisywanie wyboru jest chwilowo niedostępne. Spróbuj ponownie później.",
  fetch_failed: "Nie udało się pobrać zapisanego wyboru. Możesz spróbować ponownie za chwilę.",
  save_failed: "Nie udało się zapisać wyboru. Spróbuj ponownie za chwilę.",
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
