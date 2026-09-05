import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";

export const AVATAR_CHOICE_ERROR_PARAM = "avatarError";

const AVATAR_CHOICE_ERROR_COPY = defineCopy(
  {
    missing_auth: "Sign in to choose an avatar.",
    invalid_choice: "This avatar choice is unavailable. Pick one of the options shown.",
    config_unavailable: "Saving the choice is temporarily unavailable. Please try again later.",
    fetch_failed: "We couldn't load the saved choice. You can try again in a moment.",
    save_failed: "We couldn't save the choice. Please try again in a moment.",
  },
  {
    missing_auth: "Zaloguj się, żeby wybrać awatara.",
    invalid_choice: "Ten wybór awatara jest niedostępny. Wybierz jedną z widocznych opcji.",
    config_unavailable: "Zapisywanie wyboru jest chwilowo niedostępne. Spróbuj ponownie później.",
    fetch_failed: "Nie udało się pobrać zapisanego wyboru. Możesz spróbować ponownie za chwilę.",
    save_failed: "Nie udało się zapisać wyboru. Spróbuj ponownie za chwilę.",
  },
);

export type AvatarChoiceErrorCode = keyof typeof AVATAR_CHOICE_ERROR_COPY.en;

export const AVATAR_CHOICE_ERROR_CODES = Object.keys(AVATAR_CHOICE_ERROR_COPY.en) as readonly AvatarChoiceErrorCode[];

export function getAvatarChoiceErrorMessage(locale: Locale, code: AvatarChoiceErrorCode) {
  return AVATAR_CHOICE_ERROR_COPY[locale][code];
}

export function parseAvatarChoiceErrorCode(value: unknown): AvatarChoiceErrorCode | null {
  if (typeof value !== "string") {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(AVATAR_CHOICE_ERROR_COPY.en, value)) {
    return value as AvatarChoiceErrorCode;
  }

  return null;
}

export function getAvatarChoiceErrorRedirect(pathname: string, code: AvatarChoiceErrorCode) {
  const searchParams = new URLSearchParams({ [AVATAR_CHOICE_ERROR_PARAM]: code });
  return `${pathname}?${searchParams.toString()}`;
}
