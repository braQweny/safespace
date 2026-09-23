/**
 * Persony AI (`sessionStyleHint`, `summaryLensHint`, `registerExamples`,
 * `voiceLiveHint`) żyją tylko w serwerowym `modalities.ts`. Wszystko, co island
 * może zaimportować, ląduje w paczce klienta — kiedyś `modality-copy.ts`
 * importował katalog razem z promptami i każda przeglądarka dostawała pełne
 * „Avatar: Lena … Avoid:”. Ten test chodzi po prawdziwym grafie importów od
 * każdego modułu z `src/components/` (i od modułów katalogu) i pilnuje, żeby
 * nie dochodził do `modalities.ts` inaczej niż przez `import type`.
 */
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODALITY_CATALOG, MODALITY_CHOICES } from "../modality-catalog";
import { MODALITY_CHOICES as REEXPORTED_CHOICES, MVP_MODALITIES } from "../modalities";
import { describeChain, listSourceModules, SRC_ROOT, walkValueImports } from "./import-graph";

const PROMPT_MODULE = resolve(SRC_ROOT, "lib/modalities.ts");
const CATALOG_KEYS = ["assetPath", "avatarFirstName", "avatarId", "modalityId"];

/** Korzenie paczki klienta: każdy moduł komponentu (poza testami) i moduły katalogu dla islandów. */
function listClientRoots() {
  return [
    ...listSourceModules("components"),
    resolve(SRC_ROOT, "lib/modality-catalog.ts"),
    resolve(SRC_ROOT, "lib/modality-copy.ts"),
    resolve(SRC_ROOT, "lib/perspective-tint.ts"),
  ];
}

describe("modality catalog prompt boundary", () => {
  const reachable = walkValueImports(listClientRoots()).parents;

  it("keeps the prompt module out of every client-reachable import graph", () => {
    expect(reachable.size).toBeGreaterThan(10);
    expect(reachable.has(PROMPT_MODULE), describeChain(reachable, PROMPT_MODULE)).toBe(false);
  });

  it("does not copy persona prompts into any client-reachable module", () => {
    const promptFragments = MVP_MODALITIES.flatMap((modality) => [
      ...modality.sessionStyleHint.split("\n").filter((line) => line.length >= 40),
      modality.voiceLiveHint.en,
      modality.voiceLiveHint.pl,
    ]);

    for (const file of reachable.keys()) {
      const source = readFileSync(file, "utf8");

      for (const fragment of promptFragments) {
        expect(source.includes(fragment), `${relative(SRC_ROOT, file)} zawiera prompt: ${fragment}`).toBe(false);
      }
    }
  });

  it("exposes only ids, first names and asset paths", () => {
    for (const entry of [...MODALITY_CATALOG, ...MODALITY_CHOICES, ...REEXPORTED_CHOICES]) {
      expect(Object.keys(entry).sort()).toEqual(CATALOG_KEYS);
    }
  });

  it("builds the prompt catalog on the same perspectives, in the same order", () => {
    expect(MVP_MODALITIES.map((modality) => modality.modalityId)).toEqual(
      MODALITY_CATALOG.map((entry) => entry.modalityId),
    );

    MVP_MODALITIES.forEach((modality, index) => {
      expect(modality).toMatchObject(MODALITY_CATALOG[index]);
      expect(modality.sessionStyleHint.length, modality.modalityId).toBeGreaterThan(0);
      expect(modality.summaryLensHint.length, modality.modalityId).toBeGreaterThan(0);
    });
  });
});
