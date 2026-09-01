/**
 * Portrety awatarów są serwowane z `public/avatars/`. Katalog perspektyw
 * wskazuje je po ścieżce, więc nic w czasie budowania nie sprawdza, czy plik
 * istnieje — brakujący portret wyszedłby na jaw dopiero jako pusta ramka na
 * produkcji. Ten test wiąże wpis katalogu z plikiem na dysku i pilnuje, żeby
 * został przy lekkim formacie (PNG ważyły po ~185 KB przy 22–128 px na ekranie).
 */
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES } from "../modalities";

const PUBLIC_DIR = fileURLToPath(new URL("../../../public/", import.meta.url));
// Sufit z zapasem: dziś każdy plik ma ~4–6 KB.
const MAX_AVATAR_BYTES = 32 * 1024;

describe("modality avatar assets", () => {
  it("points every perspective at an existing WebP portrait under public/", () => {
    for (const modality of MVP_MODALITIES) {
      expect(modality.assetPath, modality.avatarId).toMatch(/^\/avatars\/[a-z-]+\.webp$/);

      const filePath = `${PUBLIC_DIR}${modality.assetPath.slice(1)}`;

      expect(existsSync(filePath), `${modality.avatarId}: brak pliku ${modality.assetPath}`).toBe(true);
      expect(statSync(filePath).size, `${modality.avatarId}: ${modality.assetPath} jest za duży`).toBeLessThanOrEqual(
        MAX_AVATAR_BYTES,
      );
    }
  });

  it("gives every perspective its own portrait", () => {
    const paths = new Set(MVP_MODALITIES.map((modality) => modality.assetPath));

    expect(paths.size).toBe(MVP_MODALITIES.length);
  });
});
