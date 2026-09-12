// Risk VOICE-OFF: voice-off.prompt.md; seed: seed.spec.ts.
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

/**
 * Public server variables of `astro:env` are inlined at build time from
 * `wrangler.jsonc` (the Cloudflare adapter's platform proxy), so the preview
 * carries whatever the repository ships. The spec reads the same source: while
 * the flag is `off` (the default) the privacy page must not promise voice
 * conversations; once the flip commit lands, the page must describe them.
 */
function readShippedVoiceFlag() {
  const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
  return /"VOICE_SESSION_MODE":\s*"on"/.test(config);
}

test("the privacy page follows the shipped voice flag and voice routes refuse an anonymous visitor", async ({
  page,
}) => {
  const voiceShipped = readShippedVoiceFlag();

  // The page promises only what ships: the table-of-contents link and the
  // section appear together, and only when the dashboard offers voice.
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy and terms of use", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "How AI works in a conversation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How AI works in a conversation", exact: true })).toBeVisible();
  const voiceLink = page.getByRole("link", { name: "Voice conversations", exact: true });
  const voiceHeading = page.getByRole("heading", { name: "Voice conversations", exact: true });
  if (voiceShipped) {
    await expect(voiceLink).toBeVisible();
    await expect(voiceHeading).toBeVisible();
  } else {
    await expect(voiceLink).toHaveCount(0);
    await expect(voiceHeading).toHaveCount(0);
  }

  // The conversation page never renders for an anonymous visitor, voice or not.
  await page.goto("/dashboard/session");
  await expect(page).toHaveURL(/\/auth\/signin$/);
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();

  // Direct JSON requests cross the real middleware (body guard, per-user
  // limiter, SSR auth) and stop at the route's own access gate: a stable 401,
  // never a 404 (route missing from the custom Worker entry) or a 500.
  const origin = new URL(page.url()).origin;
  const sessionId = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
  const connect = await page.request.post("/api/session/voice/connect", {
    headers: { Origin: origin },
    data: { sessionId, sdp: "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" },
  });
  expect(connect.status()).toBe(401);
  expect(await connect.json()).toEqual({ ok: false, type: "voice_error", code: "missing_auth" });

  const heartbeat = await page.request.post("/api/session/voice/heartbeat", {
    headers: { Origin: origin },
    data: { sessionId, epoch: 1 },
  });
  expect(heartbeat.status()).toBe(401);
  expect(await heartbeat.json()).toEqual({ ok: false, type: "voice_error", code: "missing_auth" });

  // Neither request signed the visitor in or created a conversation.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
  // Playwright disposes the context, cookies and responses. No accounts/data were created.
});
