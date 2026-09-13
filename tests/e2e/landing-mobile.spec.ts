// Risk: the landing grid clips its introduction and account actions at 320 px.
// Seed: seed.spec.ts. Real SSR, CSS and locale switching; no API mocks or accounts.
import { test, expect } from "@playwright/test";

test("the landing introduction and account actions fit a narrow phone in both languages", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  for (const locale of ["en", "pl"] as const) {
    if (locale === "pl") {
      await page.getByRole("button", { name: "Polski", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Spokojne miejsce na pierwszą rozmowę.");
      await page.evaluate(() => document.fonts.ready);
    }

    const introduction = page.getByText(
      locale === "en" ? /^Sort out your thoughts in a conversation/ : /^Uporządkuj myśli w rozmowie/,
    );
    const createAccount = page
      .getByRole("link", { name: locale === "en" ? "Create an account" : "Utwórz konto", exact: true })
      .first();
    const existingAccount = page.getByRole("link", {
      name: locale === "en" ? "I already have an account" : "Mam już konto",
      exact: true,
    });
    const preview = page.getByRole("img", {
      name: locale === "en" ? /^Preview of a conversation/ : /^Podgląd rozmowy/,
    });

    for (const element of [
      page.getByRole("heading", { level: 1 }),
      introduction,
      createAccount,
      existingAccount,
      preview,
    ]) {
      await expect(element).toBeVisible();
      // scrollWidth on the document misses clipping by overflow-x-hidden.
      // Measure the content itself against the space actually available.
      await expect
        .poll(async () => {
          const box = await element.boundingBox();
          const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
          return box !== null && box.x >= 0 && box.x + box.width <= viewportWidth;
        })
        .toBe(true);
    }
  }

  await page.getByRole("link", { name: "Utwórz konto", exact: true }).first().click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
  await expect(page.getByRole("heading", { name: "Utwórz konto", exact: true })).toBeVisible();
});
