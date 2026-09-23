import { test, expect } from "@playwright/test";

// Ryzyko i granice: signup-validation.prompt.md.
test("signup directs focus to the first invalid field without stealing it during editing", async ({ page }) => {
  await page.goto("/auth/signup");
  await expect(page.getByRole("button", { name: "Show password", exact: true }).first()).toBeEnabled();

  const email = page.getByRole("textbox", { name: "E-mail", exact: true });
  const password = page.getByLabel("Password", { exact: true });
  const submit = page.getByRole("button", { name: "Create an account", exact: true });

  await submit.click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter your e-mail address");

  await email.fill(`ux-${Date.now()}@example.com`);
  await submit.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAccessibleDescription("Enter a password");

  // Jedno pole hasła: bez „Powtórz hasło”, literówkę łapie przełącznik „Pokaż hasło”.
  await expect(page.getByLabel("Repeat password", { exact: true })).toHaveCount(0);
  await password.fill("abc");
  await submit.click();
  await expect(password).toBeFocused();
  await expect(password).toHaveAccessibleDescription(/The password must be at least 6 characters long/);

  // Zmiana wartości przy widocznym błędzie nie uruchamia ponownie transferu fokusu.
  await email.fill(`corrected-${Date.now()}@example.com`);
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("autocomplete", "email");
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  await expect(page).toHaveURL(/\/auth\/signup$/);
});
