import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HEADER_PATH = fileURLToPath(new URL("../AppHeader.astro", import.meta.url));
const THEME_SWITCH_PATH = fileURLToPath(new URL("../ThemeSwitch.astro", import.meta.url));
const DASHBOARD_PATH = fileURLToPath(new URL("../../pages/dashboard.astro", import.meta.url));

describe("AppHeader", () => {
  const header = readFileSync(HEADER_PATH, "utf8");

  it("shows 'Manage subscription' only while billing is enabled, without a database read", () => {
    expect(header).toContain("const billingEnabled = isBillingEnabled();");
    expect(header).toMatch(/\{billingEnabled \? \(\s*<a\s+href="\/account\/billing"/);
    expect(header).not.toContain("getOwnBillingStatus");
  });

  it("aligns logo and menu with the app's content container by default", () => {
    // Panel: odstęp poza `max-w-6xl` (`main` z px-*, w środku `mx-auto max-w-6xl`).
    const dashboard = readFileSync(DASHBOARD_PATH, "utf8");
    expect(dashboard).toMatch(
      /<main class="[^"]*px-4 [^"]*sm:px-6 [^"]*lg:px-8">\s*<section class="mx-auto max-w-6xl">/,
    );

    expect(header).toContain('const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8";');
    expect(header).toContain('const { activeSession = null, align = "page" } = Astro.props;');
    expect(header).toContain('align === "page" && PAGE_GUTTER');
    expect(header).toContain('"mx-auto flex h-16 max-w-6xl items-center gap-3", align === "inset" && PAGE_GUTTER');
  });

  it("reuses the shared theme switch in the account menu", () => {
    expect(header).toContain('<ThemeSwitch labelId="theme-switch-label" />');
    expect(header).not.toContain("THEME_STORAGE_KEY");
  });
});

describe("ThemeSwitch", () => {
  const themeSwitch = readFileSync(THEME_SWITCH_PATH, "utf8");

  it("labels each instance by its own id and keeps every instance on the page in sync", () => {
    expect(themeSwitch).toContain("id={labelId}");
    expect(themeSwitch).toContain("aria-labelledby={labelId}");
    expect(themeSwitch).toContain(
      'document.querySelectorAll<HTMLButtonElement>("[data-theme-switch] [data-theme-option]")',
    );
    // Ten sam klucz co pre-paint skrypt w `Layout.astro`.
    expect(themeSwitch).toContain('const THEME_STORAGE_KEY = "safespace-theme";');
    expect(themeSwitch).not.toContain("is:inline");
  });
});
