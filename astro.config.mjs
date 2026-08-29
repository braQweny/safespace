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
    // Astro hashes the bundled island scripts and styles, so the production
    // pages get XSS protection without allowing arbitrary inline scripts.
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data:",
      ],
    },
  },
  integrations: [react(), ...(siteUrl ? [sitemap()] : [])],
  // SafeSpace does not render code examples. Disabling Shiki prevents its
  // inline styles from weakening the CSP if Markdown content is added later.
  markdown: {
    syntaxHighlight: false,
  },
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
      // Poziom rozumowania odpowiedzi w rozmowie (minimal|low|medium|high|xhigh).
      // Pusty = domyślny dla modelu; wartość spoza listy jest ignorowana.
      OPENROUTER_SESSION_REASONING_EFFORT: envField.string({ context: "server", access: "public", optional: true }),
      OPENROUTER_SUMMARY_MODEL: envField.string({ context: "server", access: "public", optional: true }),
      OPENROUTER_TRANSCRIPTION_MODEL: envField.string({ context: "server", access: "public", optional: true }),
      // Adres kontaktowy pokazywany użytkownikom (stopka, blokada konta, limit
      // sesji). Bez niego UI nie obiecuje kontaktu, którego nie ma.
      SUPPORT_EMAIL: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
});
