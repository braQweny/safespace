import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertBuildSupabaseOrigin,
  buildFormActionDirective,
  collectInlineScriptHashes,
  GOOGLE_AUTH_ORIGIN,
} from "@/lib/security/csp.mjs";

const LAYOUT_PATH = new URL("../../../layouts/Layout.astro", import.meta.url);

describe("buildFormActionDirective", () => {
  it("dopuszcza cały łańcuch przekierowań logowania przez Google", () => {
    const directive = buildFormActionDirective("https://przyklad.supabase.co");

    expect(directive).toBe(
      `form-action 'self' https://przyklad.supabase.co ${GOOGLE_AUTH_ORIGIN} https://checkout.stripe.com https://billing.stripe.com`,
    );
  });

  it("bierze sam origin, bez ścieżki i parametrów", () => {
    expect(buildFormActionDirective("https://przyklad.supabase.co/auth/v1?x=1")).toContain(
      "https://przyklad.supabase.co",
    );
    expect(buildFormActionDirective("https://przyklad.supabase.co/auth/v1?x=1")).not.toContain("/auth/v1");
  });

  it("obsługuje lokalny stack Supabase z portem", () => {
    expect(buildFormActionDirective("http://127.0.0.1:54321")).toContain("http://127.0.0.1:54321");
  });

  it("pomija nierozpoznany adres, zamiast wpisywać go do polityki", () => {
    for (const value of ["", "   ", "nie-adres", undefined, null, 42]) {
      const directive = buildFormActionDirective(value);

      expect(directive).toBe(
        `form-action 'self' ${GOOGLE_AUTH_ORIGIN} https://checkout.stripe.com https://billing.stripe.com`,
      );
    }
  });
});

describe("assertBuildSupabaseOrigin", () => {
  const buildArgv = ["/usr/bin/node", "/repo/node_modules/.bin/astro", "build"];

  it("zatrzymuje produkcyjny build bez rozpoznawalnego SUPABASE_URL", () => {
    for (const value of ["", "   ", "nie-adres", undefined, null, 42]) {
      expect(() => {
        assertBuildSupabaseOrigin(value, buildArgv);
      }).toThrow(/SUPABASE_URL/);
    }
  });

  it("przepuszcza produkcyjny build z adresem projektu", () => {
    expect(() => {
      assertBuildSupabaseOrigin("https://przyklad.supabase.co", buildArgv);
    }).not.toThrow();
    expect(() => {
      assertBuildSupabaseOrigin("http://127.0.0.1:54321", buildArgv);
    }).not.toThrow();
  });

  it("nie blokuje dev, sync ani preview — te nie wysyłają CSP", () => {
    for (const command of ["dev", "sync", "preview", "check"]) {
      expect(() => {
        assertBuildSupabaseOrigin(undefined, ["/usr/bin/node", "/repo/astro", command]);
      }).not.toThrow();
    }
  });
});

describe("collectInlineScriptHashes", () => {
  it("liczy hash z dokładnej treści skryptu", () => {
    const source = '<html><script is:inline>console.info("x");</script></html>';
    const expected = `sha256-${createHash("sha256").update('console.info("x");', "utf8").digest("base64")}`;

    expect(collectInlineScriptHashes(source)).toEqual([expected]);
  });

  it("nie hashuje skryptów pakowanych przez Astro — te mają własne hashe", () => {
    expect(collectInlineScriptHashes('<script>console.info("x");</script>')).toEqual([]);
  });

  /*
   * Skrypt ustawiający motyw przed pierwszym malowaniem jest jedynym `is:inline`
   * w projekcie i bez swojego hasha zostaje zablokowany na produkcji — wtedy
   * wybór „wieczornego” motywu z menu konta przestaje działać po przeładowaniu.
   */
  it("pokrywa skrypt motywu w Layout.astro", () => {
    const hashes = collectInlineScriptHashes(readFileSync(LAYOUT_PATH, "utf8"));

    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
  });
});
