import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import type { AccountPlan, SessionQuota } from "@/lib/session-data/types";

/**
 * Jedno źródło zdań o planie konta. Te same słowa padają w karcie startu
 * (dashboard), na stronie konta i po wyczerpaniu puli — rozjazd między nimi
 * byłby rozjazdem obietnicy, ile rozmów użytkownik naprawdę ma.
 */
const PLAN_COPY = defineCopy(
  {
    premiumHowTo:
      "The premium plan isn't sold in the app yet — the SafeSpace team grants it by hand. Write to us and we'll unlock more conversations on this account.",
    premiumMailSubject: "SafeSpace — premium plan access",
    premiumPlanName: "Premium plan",
    freePlanName: "Free plan",
    unlimitedAllowance: "No limit on the number of conversations.",
    usedAllowance: (used: number, limit: number) => `Used ${used} of ${limit} free conversations.`,
    lastRemaining: (limit: number) => `This is the last of ${limit} free conversations.`,
    remaining: (remaining: number, limit: number) => `${remaining} of ${limit} free conversations left.`,
  },
  {
    premiumHowTo:
      "Plan premium nie jest jeszcze sprzedawany w aplikacji — przyznaje go ręcznie zespół SafeSpace. Napisz do nas, a odblokujemy kolejne rozmowy na tym koncie.",
    premiumMailSubject: "SafeSpace — dostęp do planu premium",
    premiumPlanName: "Plan premium",
    freePlanName: "Plan bezpłatny",
    unlimitedAllowance: "Bez limitu liczby rozmów.",
    usedAllowance: (used, limit) => `Wykorzystano ${used} z ${limit} bezpłatnych rozmów.`,
    lastRemaining: (limit) => `To ostatnia z ${limit} bezpłatnych rozmów.`,
    remaining: (remaining, limit) => `Zostały ${remaining} z ${limit} bezpłatnych rozmów.`,
  },
);

export function getPlanCopy(locale: Locale) {
  return PLAN_COPY[locale];
}

export function formatPlanName(locale: Locale, plan: AccountPlan) {
  const copy = getPlanCopy(locale);

  return plan === "premium" ? copy.premiumPlanName : copy.freePlanName;
}

export function formatSessionAllowance(locale: Locale, quota: SessionQuota) {
  const copy = getPlanCopy(locale);

  if (quota.plan === "premium" || quota.sessionLimit === null) {
    return copy.unlimitedAllowance;
  }

  // Konta sprzed wprowadzenia limitu mogą mieć więcej rozmów niż wynosi pula —
  // „19 z 3” nic użytkownikowi nie mówi; pula jest wtedy po prostu wykorzystana.
  const used = Math.min(quota.usedSessions, quota.sessionLimit);

  return copy.usedAllowance(used, quota.sessionLimit);
}

/**
 * Free accounts see how much of the allowance is left before they commit to a
 * start; premium accounts have no cap, so nothing is shown for them.
 */
export function formatRemainingFreeSessions(locale: Locale, quota: SessionQuota | null) {
  if (quota?.plan !== "free" || quota.sessionLimit === null || quota.remainingSessions === null) {
    return null;
  }

  if (quota.remainingSessions <= 0) {
    return null;
  }

  const copy = getPlanCopy(locale);

  if (quota.remainingSessions === 1) {
    return copy.lastRemaining(quota.sessionLimit);
  }

  return copy.remaining(quota.remainingSessions, quota.sessionLimit);
}

/** `mailto:` z tematem prośby o premium — ten sam temat w karcie startu i na stronie konta. */
export function getPremiumSupportMailtoHref(locale: Locale, mailtoHref: string) {
  return `${mailtoHref}?subject=${encodeURIComponent(getPlanCopy(locale).premiumMailSubject)}`;
}
