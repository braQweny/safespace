/**
 * User-visible Polish copy lives in locale copy modules. Those strings were
 * once written without diacritics, which reads as broken Polish exactly where
 * SafeSpace needs to sound trustworthy (the crisis screen). This test walks
 * the `pl` branch of every catalog at once instead of asserting sentence by
 * sentence; the English branch is covered by `i18n/__tests__/copy-parity`.
 */
import { describe, expect, it } from "vitest";
import { COPY_CATALOGS, collectStrings } from "@/lib/i18n/__tests__/copy-catalogs";

// Polish words that cannot be spelled without a diacritic. A match means the
// copy was written with ASCII substitutes ("sie" for "się", "haslo" for "hasło").
const ASCII_STRIPPED_WORDS = [
  "sie",
  "moze",
  "mozesz",
  "mozemy",
  "musisz",
  "bedzie",
  "bedziesz",
  "zeby",
  "jesli",
  "sprobuj",
  "sprobowac",
  "prosze",
  "wiadomosc",
  "tresc",
  "haslo",
  "hasla",
  "udalo",
  "potwierdz",
  "sprawdz",
  "dostepny",
  "dostepna",
  "dostepne",
  "niedostepny",
  "niedostepna",
  "niedostepne",
  "zagrozenia",
  "bezpieczenstwa",
  "pozniej",
  "wiecej",
  "zakoncz",
  "odswiez",
  "rozmowe",
  "wybor",
  "znakow",
  "prob",
  "krotkim",
];

const ASCII_STRIPPED_PATTERN = new RegExp(`\\b(${ASCII_STRIPPED_WORDS.join("|")})\\b`, "iu");

function expectProperPolish(label: string, value: string) {
  const match = ASCII_STRIPPED_PATTERN.exec(value);

  expect(match ? `${label}: "${match[0]}" in ${JSON.stringify(value)}` : null).toBeNull();
}

describe("Polish user-facing copy", () => {
  it.each(COPY_CATALOGS.map((catalog) => [catalog.name, catalog] as const))(
    "spells %s with diacritics",
    (_name, catalog) => {
      const strings = collectStrings(catalog.name, catalog.read("pl"));

      expect(strings.length).toBeGreaterThan(0);

      for (const [label, value] of strings) {
        expectProperPolish(label, value);
      }
    },
  );
});
