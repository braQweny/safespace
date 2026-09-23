import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Strony Astro nie renderują się w vitest, więc pilnujemy źródła: każda wyspa,
 * która pokazuje daty, dostaje strefę z `Astro.locals.timeZone` obok języka.
 * Bez propsa wróciłaby do Warszawy i osoba w innej strefie widziałaby złe
 * godziny i złe „Dzisiaj/Wczoraj”.
 */
function readPage(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
}

describe("islands that show dates", () => {
  it("receive the request's time zone", () => {
    expect(readPage("../dashboard.astro")).toContain("timeZone: Astro.locals.timeZone,");
    expect(readPage("../dashboard/memory.astro")).toMatch(/<MemoryView[\s\S]*?timeZone=\{Astro\.locals\.timeZone\}/);
    expect(readPage("../admin/users.astro")).toMatch(/<AdminUsersTable[\s\S]*?timeZone=\{Astro\.locals\.timeZone\}/);
    expect(readPage("../account/billing.astro")).toMatch(/<BillingPanel[\s\S]*?timeZone=\{Astro\.locals\.timeZone\}/);
  });
});
