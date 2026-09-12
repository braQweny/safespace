import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LOCALES } from "@/lib/i18n/locale";
import { getDialableNumber } from "../crisis-contact-links";
import { getCrisisResourceCatalog, getCrisisResourceRegions } from "../crisis-resources";
import { evaluateSessionSafety } from "../evaluate-session-safety";
import type { ProviderSafetyDecision, SessionSafetyProvider } from "../provider";

vi.mock("../openrouter-classifier", () => ({
  configuredSafetyProvider: {
    classify: vi.fn(),
  },
}));

const crisisProvider: SessionSafetyProvider = {
  classify: vi.fn(() =>
    Promise.resolve<ProviderSafetyDecision>({
      risk: "crisis",
      action: "hard_stop",
      reasonCode: "harm_to_others_signal",
    }),
  ),
};

const SRC_ROOT = resolve(__dirname, "../../..");
const CATALOG_PATH = resolve(__dirname, "../crisis-resources.ts");

/** Każdy plik źródłowy poza testami, który może renderować albo opisywać UI. */
function listSourceFiles() {
  return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(astro|tsx|ts)$/.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__") && path !== CATALOG_PATH);
}

describe("crisis resources", () => {
  it("keeps Poland, United States, and local fallback entries with identical numbers in every language", () => {
    for (const locale of LOCALES) {
      const catalog = getCrisisResourceCatalog(locale);

      expect(Object.keys(catalog)).toEqual(["pl", "us", "local_fallback"]);
      expect(catalog.pl.contacts.map((contact) => contact.value)).toEqual(["112", "800 70 2222"]);
      expect(catalog.us.contacts.map((contact) => contact.value)).toEqual(["988", "911"]);
      expect(catalog.local_fallback.contacts).toHaveLength(1);
    }
  });

  it("links every real number and never the local guidance placeholder", () => {
    for (const locale of LOCALES) {
      for (const region of getCrisisResourceRegions(locale)) {
        for (const contact of region.contacts) {
          const dialable = getDialableNumber(contact);

          if (contact.kind === "local_guidance") {
            expect(dialable).toBeNull();
          } else {
            expect(dialable).toBe(contact.value.replace(/\s/g, ""));
          }
        }
      }
    }
  });

  // Panel i landing miały kiedyś 112 i 800 70 2222 wpisane w szablon, więc
  // angielski interfejs pokazywał wyłącznie polskie numery. Każdy ekran ma
  // brać numery z katalogu — wtedy język etykiet i zestaw regionów idą razem.
  it("keeps every crisis number out of templates and copy modules outside the catalog", () => {
    const numbers = getCrisisResourceRegions("en")
      .flatMap((region) => region.contacts)
      .map(getDialableNumber)
      .filter((value): value is string => value !== null);
    const forms = numbers.flatMap((digits) => [digits, digits.replace(/(\d{3})(\d{2})(\d{4})/, "$1 $2 $3")]);
    const pattern = new RegExp(`(^|[^\\d])(${forms.join("|")})(?![\\d])`);
    const offenders = listSourceFiles()
      .filter((path) => pattern.test(readFileSync(path, "utf8")))
      .map((path) => relative(SRC_ROOT, path));

    expect(offenders).toEqual([]);
  });

  it("returns Polish hard-stop resources without claiming SafeSpace contacted emergency services", async () => {
    const decision = await evaluateSessionSafety(
      {
        currentUserMessage: "To jest testowa tresc dla granicy bezpieczenstwa.",
        metadata: { locale: "pl" },
      },
      { provider: crisisProvider },
    );

    const combinedText = [
      decision.copy?.title,
      decision.copy?.body,
      ...decision.crisisResources.flatMap((resource) => [
        resource.label,
        resource.note,
        ...resource.contacts.flatMap((contact) => [contact.label, contact.value, contact.description]),
      ]),
    ].join(" ");

    expect(decision.action).toBe("hard_stop");
    expect(decision.crisisResources.map((resource) => resource.id)).toEqual(["pl", "us", "local_fallback"]);
    expect(decision.copy?.body).toContain("nie kontaktuje służb");
    expect(combinedText).not.toMatch(/SafeSpace (kontaktuje|powiadamia|wzywa)/i);
    expect(combinedText).not.toMatch(/(wezwali|powiadomili|skontaktowali)(smy|śmy)/i);
  });

  it("returns English hard-stop resources by default with the same promise", async () => {
    const decision = await evaluateSessionSafety(
      { currentUserMessage: "This is a test message for the safety boundary." },
      { provider: crisisProvider },
    );

    expect(decision.action).toBe("hard_stop");
    expect(decision.copy?.body).toContain("does not contact emergency services");
    expect(decision.crisisResources.map((resource) => resource.label)).toEqual([
      "Poland",
      "United States",
      "Outside the listed regions",
    ]);
    expect(decision.crisisResources[0]?.contacts.map((contact) => contact.value)).toEqual(["112", "800 70 2222"]);
  });
});
