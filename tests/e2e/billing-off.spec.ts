// Risk BILLING-OFF: billing-off.prompt.md; seed: seed.spec.ts.
import { test, expect } from "@playwright/test";

test("disabled billing keeps an anonymous visitor at sign-in and rejects payment entry points", async ({ page }) => {
  // An isolated anonymous browser cannot enter billing, even with a forged success return.
  await page.goto("/account/billing?checkout=success");
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to test payment", exact: true })).toHaveCount(0);

  // Direct native-form requests reach the same real middleware and SSR auth boundary.
  const origin = new URL(page.url()).origin;
  for (const action of ["checkout", "portal"]) {
    const response = await page.request.post(`/api/billing/${action}`, {
      headers: { Origin: origin },
      form: {},
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe("/auth/signin");
  }
  const status = await page.request.get("/api/billing/status");
  expect(status.status()).toBe(401);
  expect(await status.json()).toEqual({ ok: false, error: { code: "missing_auth" } });

  // The off webhook rejects without calling Stripe. Its separate body boundary
  // must not accidentally inherit the normal 32 KiB API limit before routing.
  const webhook = await page.request.post("/api/billing/webhook", {
    data: "x".repeat(40 * 1024),
    headers: { "Content-Type": "application/json" },
  });
  expect(webhook.status()).toBe(503);

  // Neither attempted entry point signs the visitor in or grants paid access.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  // Playwright disposes the context, cookies and responses. No accounts/data were created.
});
