import { describe, expect, it } from "vitest";
import { COPY_CATALOGS, collectStrings } from "./copy-catalogs";

const POLISH_LETTERS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
const HAS_LETTERS = /\p{L}/u;
// Identyfikatory maszynowe (`id`, `value`, `kind` w opcjach) nie są tekstem UI.
const MACHINE_TOKEN = /^[a-z0-9_-]+$/;

// Wartości, które w obu językach wolno zostawić identyczne.
const SHARED_VALUES = new Set([
  "SafeSpace",
  "Google",
  "Premium",
  "OK",
  "E-mail",
  "Status",
  "Plan",
  "System",
  "112",
  "988",
  "911",
  "800 70 2222",
  "—",
  "Admin - SafeSpace",
]);

describe("copy parity between English and Polish", () => {
  it.each(COPY_CATALOGS.map((catalog) => [catalog.name, catalog] as const))(
    "%s has the same key paths in both languages",
    (_name, catalog) => {
      const en = collectStrings(catalog.name, catalog.read("en"));
      const pl = collectStrings(catalog.name, catalog.read("pl"));

      expect(en.map(([label]) => label)).toEqual(pl.map(([label]) => label));
      expect(en.length).toBeGreaterThan(0);
    },
  );

  it.each(COPY_CATALOGS.map((catalog) => [catalog.name, catalog] as const))(
    "%s keeps the English branch free of Polish letters and untranslated leaves",
    (_name, catalog) => {
      const en = collectStrings(catalog.name, catalog.read("en"));
      const pl = new Map(collectStrings(catalog.name, catalog.read("pl")));

      for (const [label, value] of en) {
        expect(POLISH_LETTERS.test(value) ? `${label}: ${value}` : null).toBeNull();

        const polish = pl.get(label);

        if (polish === value && HAS_LETTERS.test(value) && !SHARED_VALUES.has(value) && !MACHINE_TOKEN.test(value)) {
          expect.fail(`${label} is identical in both languages: ${JSON.stringify(value)}`);
        }
      }
    },
  );
});
