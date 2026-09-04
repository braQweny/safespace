// Runnable seed for the production hydration risk in signin-hydration.prompt.md.
// Pattern: .agents/skills/10x-e2e/references/seed-test-pattern.md.
import { test, expect } from "@playwright/test";

test("sign-in stays interactive under production CSP after a protected-page redirect", async ({ page }) => {
  // A new isolated context starts without an authenticated session.
  const response = await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/signin$/);
  expect(response?.headers()["content-security-policy"]).toContain("script-src");

  // SSR alone cannot implement this interaction: React must hydrate under CSP.
  const password = page.getByLabel("Hasło", { exact: true });
  await password.fill(`Local test password ${Date.now()}`);
  await page.getByRole("button", { name: "Pokaż hasło", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ukryj hasło", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");

  // The hydrated form must report invalid input inline, before any auth call.
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByText("Podaj adres e-mail", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  // Playwright disposes this test's context, inputs, cookies and storage.
});
