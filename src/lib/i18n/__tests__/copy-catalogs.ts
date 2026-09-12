/**
 * Rejestr wszystkich modułów tekstów do testów parytetu i diakrytyków. Nowy
 * moduł `*-copy.ts` dopisuje się tutaj — inaczej jego angielska gałąź nie
 * jest sprawdzana pod kątem brakujących kluczy ani polskich znaków.
 */
import { getAdminCopy } from "@/components/admin/admin-copy";
import { getAppHeaderCopy } from "@/components/app-header-copy";
import { getAuthFormCopy } from "@/components/auth/auth-form-copy";
import { getCrisisRegionListCopy } from "@/components/crisis-region-list-copy";
import { getLocaleSwitchCopy } from "@/components/locale-switch-copy";
import { getAvatarChoiceFormCopy } from "@/components/modality/avatar-choice-form-copy";
import { getPeopleCardsCopy } from "@/components/people/people-cards-copy";
import { getSessionHistoryCopy } from "@/components/modality/session-history-copy";
import { getSessionSummaryPanelCopy } from "@/components/modality/session-summary-panel-copy";
import { getCrisisHelpCopy } from "@/components/session/crisis-help-copy";
import { getSessionComposerCopy } from "@/components/session/session-composer-copy";
import { getSessionMessagesCopy } from "@/components/session/session-messages-copy";
import { getSessionStartCardCopy } from "@/components/session/session-start-card-copy";
import { getSessionStarterPromptsCopy } from "@/components/session/session-starter-prompts-copy";
import { getSessionTimerCopy } from "@/components/session/session-timer-copy";
import { getTimedSessionCopy } from "@/components/session/timed-session-copy";
import { getSiteFooterCopy } from "@/components/site-footer-copy";
import { getTopicMapCopy } from "@/components/topics/topic-map-copy";
import { AUTH_ERROR_CODES, getAuthErrorMessage } from "@/lib/auth-errors";
import { AVATAR_CHOICE_ERROR_CODES, getAvatarChoiceErrorMessage } from "@/lib/avatar-choice-errors";
import { getBillingCopy } from "@/lib/billing/copy";
import type { Locale } from "@/lib/i18n/locale";
import { MVP_MODALITIES } from "@/lib/modalities";
import { getModalityCopy } from "@/lib/modality-copy";
import { getAccountPagesCopy } from "@/lib/page-copy/account-pages-copy";
import { getAuthPagesCopy } from "@/lib/page-copy/auth-pages-copy";
import { getAvatarPageCopy } from "@/lib/page-copy/avatar-page-copy";
import { getDashboardCopy } from "@/lib/page-copy/dashboard-copy";
import { getLayoutCopy } from "@/lib/page-copy/layout-copy";
import { getNotFoundCopy } from "@/lib/page-copy/not-found-copy";
import { getPrivacyCopy } from "@/lib/page-copy/privacy-copy";
import { getWelcomeCopy } from "@/lib/page-copy/welcome-copy";
import { SESSION_AI_ERROR_CATEGORIES } from "@/lib/session-ai/errors";
import { getSafetyBoundaryUnavailableCopy, getSessionAiFailureCopy } from "@/lib/session-ai/session-response-copy";
import { getSessionCopy } from "@/lib/session-copy";
import { getPlanCopy } from "@/lib/session-flow/plan-copy";
import {
  FREE_TRIAL_DURATION_SECONDS,
  PREMIUM_SESSION_DURATION_SECONDS,
  formatSessionBudgetCopy,
} from "@/lib/session-flow/session-budget";
import { getCrisisResourceCatalog } from "@/lib/session-safety/crisis-resources";
import { getCrisisSafetyCopy, getSafetyUnavailableCopy } from "@/lib/session-safety/safety-copy";
import { getVoiceLiveTemplate } from "@/lib/session-ai/voice-instructions";
import { getVoiceSteeringCopy } from "@/lib/voice/steering-copy";

export interface CopyCatalog {
  name: string;
  read: (locale: Locale) => unknown;
}

export const COPY_CATALOGS: readonly CopyCatalog[] = [
  { name: "auth-errors", read: (locale) => AUTH_ERROR_CODES.map((code) => getAuthErrorMessage(locale, code)) },
  {
    name: "avatar-choice-errors",
    read: (locale) => AVATAR_CHOICE_ERROR_CODES.map((code) => getAvatarChoiceErrorMessage(locale, code)),
  },
  { name: "session-copy", read: getSessionCopy },
  { name: "safety-copy", read: (locale) => [getCrisisSafetyCopy(locale), getSafetyUnavailableCopy(locale)] },
  { name: "voice-steering-copy", read: getVoiceSteeringCopy },
  { name: "voice-live-template", read: getVoiceLiveTemplate },
  { name: "voice-live-hints", read: (locale) => MVP_MODALITIES.map((m) => m.voiceLiveHint[locale]) },
  { name: "crisis-resources", read: getCrisisResourceCatalog },
  {
    name: "session-response-copy",
    read: (locale) => [
      ...SESSION_AI_ERROR_CATEGORIES.map((category) => getSessionAiFailureCopy(category, locale)),
      getSafetyBoundaryUnavailableCopy(locale),
      getSafetyBoundaryUnavailableCopy(locale, "provider_timeout"),
      getSafetyBoundaryUnavailableCopy(locale, "provider_rate_limited"),
    ],
  },
  { name: "plan-copy", read: getPlanCopy },
  {
    name: "session-budget-copy",
    read: (locale) => [
      formatSessionBudgetCopy(locale, 60),
      formatSessionBudgetCopy(locale, FREE_TRIAL_DURATION_SECONDS),
      formatSessionBudgetCopy(locale, PREMIUM_SESSION_DURATION_SECONDS),
    ],
  },
  { name: "billing-copy", read: getBillingCopy },
  { name: "modality-copy", read: (locale) => MVP_MODALITIES.map((m) => getModalityCopy(locale, m.modalityId)) },
  { name: "locale-switch-copy", read: getLocaleSwitchCopy },
  { name: "app-header-copy", read: getAppHeaderCopy },
  { name: "site-footer-copy", read: getSiteFooterCopy },
  { name: "auth-form-copy", read: getAuthFormCopy },
  { name: "admin-copy", read: getAdminCopy },
  { name: "avatar-choice-form-copy", read: getAvatarChoiceFormCopy },
  { name: "session-history-copy", read: getSessionHistoryCopy },
  { name: "people-cards-copy", read: getPeopleCardsCopy },
  { name: "topic-map-copy", read: getTopicMapCopy },
  { name: "session-summary-panel-copy", read: getSessionSummaryPanelCopy },
  { name: "crisis-help-copy", read: getCrisisHelpCopy },
  { name: "crisis-region-list-copy", read: getCrisisRegionListCopy },
  { name: "session-composer-copy", read: getSessionComposerCopy },
  { name: "session-messages-copy", read: getSessionMessagesCopy },
  { name: "session-start-card-copy", read: getSessionStartCardCopy },
  { name: "session-starter-prompts-copy", read: getSessionStarterPromptsCopy },
  { name: "session-timer-copy", read: getSessionTimerCopy },
  { name: "timed-session-copy", read: getTimedSessionCopy },
  { name: "layout-copy", read: getLayoutCopy },
  { name: "dashboard-copy", read: getDashboardCopy },
  { name: "avatar-page-copy", read: getAvatarPageCopy },
  { name: "welcome-copy", read: getWelcomeCopy },
  { name: "privacy-copy", read: getPrivacyCopy },
  { name: "auth-pages-copy", read: getAuthPagesCopy },
  { name: "account-pages-copy", read: getAccountPagesCopy },
  { name: "not-found-copy", read: getNotFoundCopy },
];

/** Liście tekstowe z etykietą ścieżki; funkcje (formattery) są pomijane. */
export function collectStrings(label: string, value: unknown): [string, string][] {
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
