// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// Finalna domena nie jest jeszcze wybrana (context/deployment/deploy-plan.md),
// a `@astrojs/sitemap` bez `site` po cichu nic nie generuje i tylko zgłasza
// ostrzeżenie w każdym buildzie. Integracja włącza się więc dopiero wtedy, gdy
// build dostanie `SITE_URL` — do tego czasu nie udaje, że działa.
const configuredSiteUrl = process.env.SITE_URL?.trim();
const siteUrl = configuredSiteUrl && configuredSiteUrl.length > 0 ? configuredSiteUrl : undefined;

// https://astro.build/config
export default defineConfig({
  output: "server",
  ...(siteUrl ? { site: siteUrl } : {}),
  // CSRF: reject POST/PATCH/PUT/DELETE with a mismatched Origin header (403).
  // This is Astro's default since v5 — kept explicit so it cannot be disabled
  // (or change with a future default) unnoticed. JSON requests are additionally
  // covered by the browser CORS preflight model.
  security: {
    checkOrigin: true,
  },
  integrations: [react(), ...(siteUrl ? [sitemap()] : [])],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPERATIONAL_LOG_HASH_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      OPENROUTER_SAFETY_MODEL: envField.string({ context: "server", access: "public", optional: true }),
      OPENROUTER_SESSION_MODEL: envField.string({ context: "server", access: "public", optional: true }),
      OPENROUTER_SUMMARY_MODEL: envField.string({ context: "server", access: "public", optional: true }),
      OPENROUTER_TRANSCRIPTION_MODEL: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
});
