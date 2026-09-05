// Ryzyko: przełącznik języka jest natywnym formularzem, który musi wrócić na
// tę samą stronę w drugim języku i zapamiętać wybór w cookie bez udziału JS.
import { test, expect } from "@playwright/test";

test("switching to Polish re-renders the sign-in page in Polish and keeps the choice", async ({ page }) => {
  await page.goto("/auth/signin");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Polski", exact: true }).click();

  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("button", { name: "Zaloguj się", exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "pl");
  await expect(page.getByRole("button", { name: "English", exact: true })).toBeVisible();
});
