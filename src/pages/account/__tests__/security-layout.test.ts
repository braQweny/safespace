import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getAccountPagesCopy } from "@/lib/page-copy/account-pages-copy";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));
const BLOCKED_PATH = fileURLToPath(new URL("../blocked.astro", import.meta.url));

/**
 * Strona konta po audycie UX z 23 września 2026 (390 px, 2716 px wysokości):
 * plan w dwóch wierszach i jednym wezwaniu, jedno zdanie o wyłączaniu pamięci,
 * język z wyglądem w jednej karcie, zwinięte hasło i „Zarządzaj abonamentem”
 * tylko tam, gdzie strona abonamentu coś zrobi.
 */
describe("account page layout", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");

  it("keeps a space between 'Signed in as' and the address", () => {
    // Astro gubił biały znak z nową linią między wyrażeniem a elementem: „jakoadres@…”.
    expect(page).toMatch(/\{copy\.signedInAs\}\{" "\}\s*<span/);
  });

  it("titles the plan card with the plan and renders the allowance as definition rows", () => {
    expect(page).toContain("{formatPlanName(locale, quota.plan)}</h2>");
    expect(page).toMatch(/<dt[^>]*>\{row\.label\}<\/dt>/);
    expect(page).toMatch(/<dd[^>]*>\{row\.value\}<\/dd>/);
    // Jedno zdanie o premium i jedno wezwanie; nota o usuwaniu tylko dla planu bezpłatnego.
    expect(page.match(/\{premiumSentence\}/g)).toHaveLength(1);
    expect(page).toContain("data-account-premium-cta");
    expect(page).toContain("isFreePlan ? <p");
    expect(page).not.toContain("copy.eachLasts");
    expect(page).not.toContain("getPlanCopy(locale).premiumHowTo");
  });

  it("chooses the one premium call to action from the billing mode", () => {
    expect(page).toContain('? { href: "/account/billing", label: billingCopy.discover }');
    expect(page).toContain("getPremiumSupportMailtoHref(locale, support.mailtoHref), label: copy.writeAboutPremium");
  });

  it("offers subscription management only where the billing page can do something", () => {
    expect(page).toContain("const showsManageBilling = billingEnabled ? !isFreePlan : hasBillingRecord;");
    // Rekord rozliczeniowy czytany tylko przy wyłączonych płatnościach, w tej samej rundzie co reszta.
    expect(page).toContain("billingEnabled ? null : getOwnBillingStatus(Astro)");
    expect(page).toContain("hasBillingRecord = billingStatus?.ok ? billingStatus.data.canManage : false;");
    expect(page).toMatch(/showsManageBilling \? \(\s*<a href="\/account\/billing"/);
  });

  it("puts language and appearance in one card, reusing the header's theme switch", () => {
    expect(page).toContain('<LocaleSwitch variant="segmented" />');
    expect(page).toContain('<ThemeSwitch labelId="account-theme-label" />');
    expect(page.indexOf("data-account-locale")).toBeLessThan(
      page.indexOf('<ThemeSwitch labelId="account-theme-label"'),
    );
  });

  it("collapses the password form and opens it for a save result or a recovery link", () => {
    expect(page).toMatch(/<details[^>]*id="change-password"[^>]*open=\{passwordFormOpen\}/);
    // `#password` to już id pola w `SetPasswordForm` — karta nie może go dublować.
    expect(page).not.toContain('id="password"');
    expect(page).toContain("error !== null ||");
    expect(page).toContain("successMessage !== null ||");
    expect(page).toContain("Astro.url.searchParams.get(PASSWORD_FORM_PARAM) === PASSWORD_RECOVERY_VALUE");
    expect(page).toContain("{copy.passwordHint}");
  });

  it("ends with one sentence about data, the privacy link and account deletion", () => {
    expect(page).toContain('href="/privacy"');
    expect(page).toContain('href="/account/delete"');
    expect(page).not.toContain("copy.deleteNote");
  });

  it("uses the perspective's first name instead of 'avatar' in the memory copy", () => {
    for (const locale of ["en", "pl"] as const) {
      const memory = getAccountPagesCopy(locale).security.memory;

      expect(memory.viewLink("Lena")).toContain("Lena");
      expect(memory.intro.toLowerCase()).not.toContain("avatar");
      expect(memory.intro.toLowerCase()).not.toContain("awatar");
      expect(memory.switchNote.toLowerCase()).not.toMatch(/avatar|awatar/);
      expect(memory.deleteBody.toLowerCase()).not.toMatch(/avatar|awatar/);
    }
  });
});

describe("blocked account page", () => {
  const page = readFileSync(BLOCKED_PATH, "utf8");

  it("keeps the subscription link while billing is on and for an owner with a billing record", () => {
    expect(page).toContain("const showsBillingLink = billingEnabled || hasBillingRecord;");
    expect(page).toContain("hasBillingRecord = billing.ok && billing.data.canManage;");
    expect(page).toMatch(/showsBillingLink \? \(\s*<a\s+href="\/account\/billing"/);
    // Deletion stays reachable for a blocked owner whatever the billing mode.
    expect(page).toContain('href="/account/delete"');
  });
});
