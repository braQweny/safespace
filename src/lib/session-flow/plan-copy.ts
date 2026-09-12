import { defineCopy } from "@/lib/i18n/copy";
import type { Locale } from "@/lib/i18n/locale";
import { plural, type PluralForms } from "@/lib/i18n/plural";
import type { AccountPlan, SessionQuota, VoiceQuota } from "@/lib/session-data/types";

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
    voiceTrialAvailable: (minutes: number, unit: string) =>
      `One voice conversation of up to ${minutes} ${unit} is included in the free plan.`,
    voiceTrialUsed:
      "The free voice conversation has been used. The premium plan includes a monthly pool of voice minutes.",
    voiceMinutesRemaining: (remaining: number, unit: string, limit: number) =>
      `${remaining} ${unit} of ${limit} voice minutes left this month.`,
    voiceMinutesUsed: (used: number, unit: string, limit: number) =>
      `Used ${used} ${unit} of ${limit} voice minutes this month.`,
    voiceMinutesExhausted:
      "The monthly pool of voice minutes has been used up. It renews at the start of the next month.",
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
    voiceTrialAvailable: (minutes, unit) => `W planie bezpłatnym jest jedna rozmowa głosowa do ${minutes} ${unit}.`,
    voiceTrialUsed: "Bezpłatna rozmowa głosowa została wykorzystana. Plan premium ma miesięczną pulę minut głosowych.",
    // Czasownik zgadza się z liczbą jak jednostka: „została 1 minuta”, „zostały 22 minuty”, „zostało 5 minut”.
    voiceMinutesRemaining: (remaining, unit, limit) =>
      `${plural("pl", remaining, { one: "Została", few: "Zostały", many: "Zostało" })} ${remaining} ${unit} z ${limit} minut głosowych w tym miesiącu.`,
    voiceMinutesUsed: (used, unit, limit) => `Wykorzystano ${used} ${unit} z ${limit} minut głosowych w tym miesiącu.`,
    voiceMinutesExhausted:
      "Miesięczna pula minut głosowych została wykorzystana. Odnowi się na początku następnego miesiąca.",
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

function toWholeMinutes(seconds: number) {
  return Math.max(0, Math.floor(seconds / 60));
}

/** Mianownik po liczebniku: „1 minuta”, „2 minuty”, „5 minut”; po angielsku „minute(s)”. */
const MINUTES_UNIT: Readonly<Record<Locale, PluralForms>> = {
  en: { one: "minute", many: "minutes" },
  pl: { one: "minuta", few: "minuty", many: "minut" },
};

/** Dopełniacz po „do”: „do 1 minuty”, „do 10 minut”. */
const MINUTES_UNIT_AFTER_UP_TO: Readonly<Record<Locale, PluralForms>> = {
  en: { one: "minute", many: "minutes" },
  pl: { one: "minuty", few: "minuty", many: "minut" },
};

/** Jedno zdanie o puli głosowej: próba free (dostępna albo zużyta) lub minuty premium. */
export function formatVoiceAllowance(locale: Locale, quota: VoiceQuota) {
  const copy = getPlanCopy(locale);

  if (quota.kind === "trial") {
    if (!quota.available) {
      return copy.voiceTrialUsed;
    }

    const minutes = toWholeMinutes(quota.durationSeconds);
    return copy.voiceTrialAvailable(minutes, plural(locale, minutes, MINUTES_UNIT_AFTER_UP_TO[locale]));
  }

  const limit = toWholeMinutes(quota.limitSeconds);
  const used = Math.min(limit, toWholeMinutes(quota.usedSeconds));
  return copy.voiceMinutesUsed(used, plural(locale, used, MINUTES_UNIT[locale]), limit);
}

/** Ile minut premium zostało w tym miesiącu; `null` dla próby free i wyczerpanej puli. */
export function formatVoiceMinutesRemaining(locale: Locale, quota: VoiceQuota | null) {
  if (quota?.kind !== "pool" || !quota.canStartVoice) {
    return null;
  }

  const copy = getPlanCopy(locale);
  const limit = toWholeMinutes(quota.limitSeconds);
  const remaining = Math.min(limit, toWholeMinutes(quota.remainingSeconds));
  return copy.voiceMinutesRemaining(remaining, plural(locale, remaining, MINUTES_UNIT[locale]), limit);
}

/** `mailto:` z tematem prośby o premium — ten sam temat w karcie startu i na stronie konta. */
export function getPremiumSupportMailtoHref(locale: Locale, mailtoHref: string) {
  return `${mailtoHref}?subject=${encodeURIComponent(getPlanCopy(locale).premiumMailSubject)}`;
}
