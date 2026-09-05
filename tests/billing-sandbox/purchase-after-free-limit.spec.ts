// Risk: a failed payment grants access, or a paid owner stays locked out after
// the three free slots. Seed: tests/e2e/seed.spec.ts; see purchase.prompt.md.
import { test, expect, enterSandboxCard } from "./fixture";

test("only a confirmed sandbox payment unlocks a fourth 60-minute conversation and survives login", async ({
  page,
  context,
  billing,
}) => {
  // Each test owns its real Auth account, local rows, customer and Test Clock.
  const avatar = await context.request.post("/api/profile/avatar", {
    headers: { Origin: billing.appUrl },
    form: { modalityId: "cbt" },
    maxRedirects: 0,
  });
  expect(avatar.status()).toBe(303);
  expect(avatar.headers().location).toBe("/dashboard?avatar=updated");
  const denied = await context.request.post("/api/session/start-next", {
    headers: { Origin: billing.appUrl, Accept: "application/json" },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()) as unknown).toMatchObject({ code: "session_limit_reached" });

  // Follow the exhausted user's real purchase path and hosted Stripe Checkout.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "See the premium subscription", exact: true }).click();
  await page.getByRole("button", { name: "Continue to test payment", exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\//);
  await enterSandboxCard(page, "4000000000000002");
  await page.getByRole("button", { name: "Pay and subscribe", exact: true }).click();
  await expect(
    page.getByText("Your credit card was declined. Try paying with a debit card instead.", { exact: true }),
  ).toBeVisible();
  expect((await billing.paidStatus()).active).toBe(false);

  // Retry the same checkout with Stripe's successful sandbox card.
  await enterSandboxCard(page, "4242424242424242");
  await page.getByRole("button", { name: "Pay and subscribe", exact: true }).click();
  await expect(page).toHaveURL(`${billing.appUrl}/account/billing?checkout=success`, { timeout: 60_000 });
  await expect.poll(async () => (await billing.paidStatus()).active, { timeout: 60_000 }).toBe(true);
  await expect(page.getByText("Paid premium access is active", { exact: true })).toBeVisible();

  // Start through the real application gate; no billing/session rows are seeded
  // after payment. Opening AI is real and may incur a sandbox-verification call.
  const started = await context.request.post("/api/session/start-next", {
    headers: { Origin: billing.appUrl, Accept: "application/json" },
    timeout: 90_000,
  });
  expect(started.status()).toBe(201);
  expect((await started.json()) as unknown).toMatchObject({
    ok: true,
    session: { status: "active", durationBucketSeconds: 3600 },
  });
  const active = await billing.db.query<{ duration: number; seconds: number }>(
    `select duration_bucket_seconds as duration,extract(epoch from expires_at-started_at)::int as seconds
     from public.therapy_sessions where user_id=$1 and status='active'`,
    [billing.userId],
  );
  expect(active.rows).toEqual([{ duration: 3600, seconds: 3600 }]);

  // A fresh authentication session must read the persisted paid entitlement.
  await billing.signInAgain(context);
  await page.goto("/account/billing");
  await expect(page.getByText("Paid premium access is active", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Paid premium access is active", { exact: true })).toBeVisible();

  // The authenticated owner must reach the real portal for their subscription.
  await page.getByRole("button", { name: "Open the billing portal", exact: true }).click();
  await expect(page).toHaveURL(/^https:\/\/billing\.stripe\.com\//);
  await expect(page.getByText("SafeSpace Premium", { exact: true })).toBeVisible();
  // Fixture finally expires Checkout, cancels subscriptions, deletes its Test
  // Clock/customer and erases exactly this disposable local Auth account.
});
