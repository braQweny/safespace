/**
 * User-visible Polish copy lives in a handful of catalog modules. Those strings
 * were once written without diacritics, which reads as broken Polish exactly
 * where SafeSpace needs to sound trustworthy (the crisis screen). This test
 * pins the whole surface at once instead of asserting sentence by sentence.
 */
import { describe, expect, it } from "vitest";
import { getAuthErrorMessage, type AuthErrorCode } from "../auth-errors";
import { getAvatarChoiceErrorMessage, type AvatarChoiceErrorCode } from "../avatar-choice-errors";
import { SESSION_AI_ERROR_CATEGORIES } from "../session-ai/errors";
import { getSessionAiFailureCopy } from "../session-ai/session-response-copy";
import { CRISIS_RESOURCE_CATALOG } from "../session-safety/crisis-resources";
import { getCrisisSafetyCopy, getSafetyUnavailableCopy } from "../session-safety/safety-copy";

// Polish words that cannot be spelled without a diacritic. A match means the
// copy was written with ASCII substitutes ("sie" for "się", "haslo" for "hasło").
const ASCII_STRIPPED_WORDS = [
  "sie",
  "moze",
  "mozesz",
  "mozemy",
  "musisz",
  "bedzie",
  "bedziesz",
  "zeby",
  "jesli",
  "sprobuj",
  "sprobowac",
  "prosze",
  "wiadomosc",
  "tresc",
  "haslo",
  "hasla",
  "udalo",
  "potwierdz",
  "sprawdz",
  "dostepny",
  "dostepna",
  "dostepne",
  "niedostepny",
  "niedostepna",
  "niedostepne",
  "zagrozenia",
  "bezpieczenstwa",
  "pozniej",
  "wiecej",
  "zakoncz",
  "odswiez",
  "rozmowe",
  "wybor",
  "znakow",
  "prob",
  "krotkim",
];

const ASCII_STRIPPED_PATTERN = new RegExp(`\\b(${ASCII_STRIPPED_WORDS.join("|")})\\b`, "iu");

function expectProperPolish(label: string, value: string) {
  const match = ASCII_STRIPPED_PATTERN.exec(value);

  expect(match ? `${label}: "${match[0]}" in ${JSON.stringify(value)}` : null).toBeNull();
}

function collectStrings(label: string, value: unknown): [string, string][] {
  if (typeof value === "string") {
    return [[label, value]];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(`${label}[${index}]`, item));
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => collectStrings(`${label}.${key}`, item));
  }

  return [];
}

describe("Polish user-facing copy", () => {
  it("spells crisis and safety copy with diacritics", () => {
    for (const [label, value] of [
      ...collectStrings("crisisSafetyCopy", getCrisisSafetyCopy()),
      ...collectStrings("safetyUnavailableCopy", getSafetyUnavailableCopy()),
      // Every region renders inside the Polish crisis screen, so the whole
      // catalog (including "us") must be written in Polish.
      ...Object.entries(CRISIS_RESOURCE_CATALOG).flatMap(([regionId, region]) =>
        collectStrings(`crisisResources.${regionId}`, region),
      ),
    ]) {
      expectProperPolish(label, value);
    }
  });

  it("spells AI failure copy with diacritics", () => {
    for (const category of SESSION_AI_ERROR_CATEGORIES) {
      for (const [label, value] of collectStrings(category, getSessionAiFailureCopy(category))) {
        expectProperPolish(label, value);
      }
    }
  });

  it("spells auth and avatar error copy with diacritics", () => {
    const authCodes: AuthErrorCode[] = [
      "auth_not_configured",
      "invalid_email",
      "missing_password",
      "password_too_short",
      "passwords_do_not_match",
      "invalid_credentials",
      "email_not_confirmed",
      "rate_limited",
      "signin_failed",
      "signup_failed",
      "password_update_failed",
      "signout_failed",
      "oauth_start_failed",
      "oauth_callback_failed",
      "reset_password_failed",
    ];
    const avatarCodes: AvatarChoiceErrorCode[] = [
      "missing_auth",
      "invalid_choice",
      "config_unavailable",
      "fetch_failed",
      "save_failed",
    ];

    for (const code of authCodes) {
      expectProperPolish(`auth.${code}`, getAuthErrorMessage(code));
    }

    for (const code of avatarCodes) {
      expectProperPolish(`avatar.${code}`, getAvatarChoiceErrorMessage(code));
    }
  });
});
