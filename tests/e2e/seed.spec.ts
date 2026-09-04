// Runnable seed for the production hydration risk in signin-hydration.prompt.md.
// Pattern: .agents/skills/10x-e2e/references/seed-test-pattern.md.
import { test, expect } from "@playwright/test";

test("sign-in stays interactive under production CSP after a protected-page redirect", async ({ page }) => {
  // Slow script delivery must leave JS-only controls visibly unavailable.
  let releaseScripts: (() => void) | undefined;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/_astro/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });

  // A new isolated context starts without an authenticated session.
  const showPassword = page.getByRole("button", { name: "Pokaż hasło", exact: true });
  try {
    const response = await page.goto("/dashboard", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/auth\/signin$/);
    expect(response?.headers()["content-security-policy"]).toContain("script-src");
    await expect(showPassword).toBeDisabled();
  } finally {
    releaseScripts?.();
  }
  await expect(showPassword).toBeEnabled();

  // SSR alone cannot implement this interaction: React must hydrate under CSP.
  const password = page.getByLabel("Hasło", { exact: true });
  const enteredPassword = `Local test password ${Date.now()}`;
  await password.fill(enteredPassword);
  await showPassword.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue(enteredPassword);
  await page.getByRole("button", { name: "Ukryj hasło", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");

  // The hydrated form must report invalid input inline, before any auth call.
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page.getByText("Podaj adres e-mail", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/signin$/);
  // Playwright disposes this test's context, inputs, cookies and storage.
});
