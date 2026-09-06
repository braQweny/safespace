// @ts-check
import { readFileSync } from "node:fs";
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import { loadEnv } from "vite";
import {
  assertBuildSupabaseOrigin,
  buildFormActionDirective,
  collectInlineScriptHashes,
} from "./src/lib/security/csp.mjs";

// Finalna domena nie jest jeszcze wybrana (context/deployment/deploy-plan.md),
// a `@astrojs/sitemap` bez `site` po cichu nic nie generuje i tylko zgłasza
// ostrzeżenie w każdym buildzie. Integracja włącza się więc dopiero wtedy, gdy
// build dostanie `SITE_URL` — do tego czasu nie udaje, że działa.
const configuredSiteUrl = process.env.SITE_URL?.trim();
const siteUrl = configuredSiteUrl && configuredSiteUrl.length > 0 ? configuredSiteUrl : undefined;

// CSP powstaje w czasie budowania, więc adres projektu Supabase też musi być
// znany wtedy. `loadEnv` z pustym prefiksem czyta i `.env` (praca lokalna),
// i zmienne procesu (CI ma `SUPABASE_URL` w sekretach builda).
const buildEnv = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

// Bez adresu dyrektywa po cichu wypadłaby bez originu Supabase i logowanie
// przez Google umarłoby dopiero na produkcji — produkcyjny build zatrzymuje się
// tu z jasnym komunikatem. Dev, sync i testy nie wysyłają CSP, więc ich to nie
// dotyczy.
assertBuildSupabaseOrigin(buildEnv.SUPABASE_URL, process.argv);
const formActionDirective = buildFormActionDirective(buildEnv.SUPABASE_URL);

// Skrypt ustawiający motyw jest wstawiony wprost w `Layout.astro` (`is:inline`),
// a takich Astro nie hashuje samo — bez tego wpisu CSP go blokuje i zapisany
// wybór motywu przestaje działać po przeładowaniu strony.
const inlineScriptHashes = collectInlineScriptHashes(
  readFileSync(new URL("./src/layouts/Layout.astro", import.meta.url), "utf8"),
);

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
        formActionDirective,
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data:",
      ],
      scriptDirective: {
        hashes: inlineScriptHashes,
      },
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
      BILLING_MODE: envField.string({ context: "server", access: "secret", optional: true }),
      STRIPE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      STRIPE_WEBHOOK_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
      STRIPE_PRICE_ID: envField.string({ context: "server", access: "secret", optional: true }),
      BILLING_APP_URL: envField.string({ context: "server", access: "secret", optional: true }),
      BILLING_DATABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
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
      // Karty osób („Osoby z Twoich rozmów”): off|on. Wyłączone gasi ekstrakcję,
      // sekcję na panelu i brief w prompcie; zarządzanie istniejącymi zapisami
      // (zapomnienie, usunięcie) działa zawsze. Wartość spoza listy = off.
      PEOPLE_MEMORY_MODE: envField.string({ context: "server", access: "public", optional: true }),
      // Soczewki tematyczne w rozmowie: off|on. Włączone uruchamia tani
      // klasyfikator tematu równolegle z bezpieczeństwem (fail-open) i dokleja
      // moduł „co słyszeć i o co pytać” do sekcji nurtu. Wartość spoza listy = off.
      SESSION_LENS_MODE: envField.string({ context: "server", access: "public", optional: true }),
      // Mapa tematów (trudności, powiązane osoby, sposoby radzenia sobie): off|on.
      // Wyłączone gasi ekstrakcję trudności w potoku kart osób, sekcję na panelu
      // i brief w prompcie; zarządzanie zapisami działa zawsze. Wartość spoza listy = off.
      TOPIC_MAP_MODE: envField.string({ context: "server", access: "public", optional: true }),
    },
  },
});
