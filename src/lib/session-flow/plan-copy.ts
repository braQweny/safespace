import type { AccountPlan, SessionQuota } from "@/lib/session-data/types";

/**
 * Jedno źródło zdań o planie konta. Te same słowa padają w karcie startu
 * (dashboard), na stronie konta i po wyczerpaniu puli — rozjazd między nimi
 * byłby rozjazdem obietnicy, ile rozmów użytkownik naprawdę ma.
 */

export const PREMIUM_HOW_TO_COPY =
  "Plan premium nie jest jeszcze sprzedawany w aplikacji — przyznaje go ręcznie zespół SafeSpace. Napisz do nas, a odblokujemy kolejne rozmowy na tym koncie.";

export function formatPlanName(plan: AccountPlan) {
  return plan === "premium" ? "Plan premium" : "Plan bezpłatny";
}

export function formatSessionAllowance(quota: SessionQuota) {
  if (quota.plan === "premium" || quota.sessionLimit === null) {
    return "Bez limitu liczby rozmów.";
  }

  // Konta sprzed wprowadzenia limitu mogą mieć więcej rozmów niż wynosi pula —
  // „19 z 3” nic użytkownikowi nie mówi; pula jest wtedy po prostu wykorzystana.
  const used = Math.min(quota.usedSessions, quota.sessionLimit);

  return `Wykorzystano ${used} z ${quota.sessionLimit} bezpłatnych rozmów.`;
}

/**
 * Free accounts see how much of the allowance is left before they commit to a
 * start; premium accounts have no cap, so nothing is shown for them.
 */
export function formatRemainingFreeSessions(quota: SessionQuota | null) {
  if (quota?.plan !== "free" || quota.sessionLimit === null || quota.remainingSessions === null) {
    return null;
  }

  if (quota.remainingSessions <= 0) {
    return null;
  }

  if (quota.remainingSessions === 1) {
    return `To ostatnia z ${quota.sessionLimit} bezpłatnych rozmów.`;
  }

  return `Zostały ${quota.remainingSessions} z ${quota.sessionLimit} bezpłatnych rozmów.`;
}
