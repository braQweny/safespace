/**
 * Skrypt przed pierwszym malowaniem w `Layout.astro` zapisuje strefę czasową
 * przeglądarki do ciasteczka, z którego middleware bierze `locals.timeZone`.
 * Uruchamiamy prawdziwą treść skryptu z podstawionym `document`, bo to jedyne
 * miejsce, które to ciasteczko pisze.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TIME_ZONE_COOKIE_NAME } from "@/lib/i18n/time-zone";

const LAYOUT_PATH = fileURLToPath(new URL("../../layouts/Layout.astro", import.meta.url));
const inlineScript = /<script is:inline>([\s\S]*?)<\/script>/.exec(readFileSync(LAYOUT_PATH, "utf8"))?.[1] ?? "";

function runLayoutScript(options: { cookie: string; zone: string; protocol?: string }) {
  const writes: string[] = [];
  vi.stubGlobal("localStorage", { getItem: () => null });
  vi.stubGlobal("location", { protocol: options.protocol ?? "https:" });
  vi.stubGlobal("document", {
    documentElement: { dataset: {} },
    get cookie() {
      return options.cookie;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  });
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () => ({ resolvedOptions: () => ({ timeZone: options.zone }) }) as unknown as Intl.DateTimeFormat,
  );

  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs the exact inline script shipped in the layout
  const script = new Function(inlineScript) as () => void;
  script();

  return writes;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("layout time zone script", () => {
  it("writes the browser's zone into the cookie the middleware reads", () => {
    expect(inlineScript).toContain(`${TIME_ZONE_COOKIE_NAME}=`);

    const writes = runLayoutScript({ cookie: "", zone: "America/New_York" });

    expect(writes).toEqual([
      `${TIME_ZONE_COOKIE_NAME}=America%2FNew_York; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    ]);
  });

  it("does not rewrite the cookie on every page when the zone is unchanged", () => {
    const writes = runLayoutScript({
      cookie: `safespace-locale=pl; ${TIME_ZONE_COOKIE_NAME}=America%2FNew_York`,
      zone: "America/New_York",
    });

    expect(writes).toEqual([]);
  });

  it("updates the cookie after travel, without Secure on plain http in dev", () => {
    const writes = runLayoutScript({
      cookie: `${TIME_ZONE_COOKIE_NAME}=America%2FNew_York`,
      zone: "Europe/London",
      protocol: "http:",
    });

    expect(writes).toEqual([`${TIME_ZONE_COOKIE_NAME}=Europe%2FLondon; Path=/; Max-Age=31536000; SameSite=Lax`]);
  });
});
