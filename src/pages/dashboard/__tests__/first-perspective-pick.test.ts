import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODALITY_CHOICES } from "@/lib/modalities";
import { getModalityCopy } from "@/lib/modality-copy";

/**
 * Pierwsza rozmowa zaczyna się z jednej karty panelu: twarze są wyborem, a
 * przycisk mówi, z kim się zaczyna. Strony Astro nie renderują się w vitest,
 * więc pilnujemy źródła — tak jak `memory-shortcut.test.ts`.
 */
const DASHBOARD_PATH = fileURLToPath(new URL("../../dashboard.astro", import.meta.url));

describe("first-run perspective pick on the dashboard", () => {
  const page = readFileSync(DASHBOARD_PATH, "utf8");
  const firstSteps = page.slice(page.indexOf("data-first-steps"), page.indexOf("</form>"));

  it("is a native form that saves the choice and asks the dashboard to start", () => {
    // Bez JS formularz działa tak samo; start i wszystkie bramki puli zostają w
    // `/api/session/start*`, a `/api/profile/avatar` przekazuje tylko intencję.
    expect(page).toContain('<form method="post" action="/api/profile/avatar" class="group" data-first-steps>');
    expect(firstSteps).toContain('<input type="hidden" name="intent" value="save_and_start" />');
    expect(firstSteps).toContain('name="modalityId"');
    expect(firstSteps).toContain('type="submit"');
  });

  it("makes the faces the choice instead of pictures next to a link to another page", () => {
    expect(firstSteps).toContain('type="radio"');
    expect(firstSteps).toContain("<legend");
    expect(firstSteps).toContain("checked={modality.modalityId === FIRST_PICK_DEFAULT}");
    // Osobna strona wyboru zostaje, ale jako cichy link do porównania.
    expect(firstSteps).toContain('href="/dashboard/avatar"');
    expect(firstSteps).toContain("copy.comparePerspectives");
    expect(page).not.toContain("copy.firstStepsEyebrow");
  });

  it("defaults to the perspective whose own description recommends it as a first choice", () => {
    expect(page).toContain('const FIRST_PICK_DEFAULT: ModalityId = "integrative";');
    expect(getModalityCopy("pl", "integrative").pairingNote).toContain("dobrym pierwszym wyborem");
  });

  it("spells out the selection classes in full for every perspective so Tailwind generates them", () => {
    for (const { modalityId } of MODALITY_CHOICES) {
      expect(page).toContain(`"group-has-[#first-pick-${modalityId}:checked]:block"`);
      expect(page).toContain(`"group-has-[#first-pick-${modalityId}:checked]:inline"`);
    }
    // Bez `:has` zostaje ogólny napis przycisku, nigdy pusty przycisk.
    expect(firstSteps).toContain('<span class="group-has-[:checked]:hidden">{copy.startGeneric}</span>');
  });

  it("names the start button after the chosen person in both languages", () => {
    for (const { modalityId, avatarFirstName } of MODALITY_CHOICES) {
      expect(getModalityCopy("en", modalityId).withAvatar).toBe(`with ${avatarFirstName}`);
      expect(getModalityCopy("pl", modalityId).withAvatar).toMatch(/^z [A-ZŁ][a-ząęłńóśźż]+$/);
    }
    expect(getModalityCopy("pl", "psychodynamic").withAvatar).toBe("z Leną");
    expect(getModalityCopy("pl", "systemic").withAvatar).toBe("z Olkiem");
  });

  it("shows voice samples as sentences, starting with a capital letter", () => {
    for (const { modalityId } of MODALITY_CHOICES) {
      for (const locale of ["en", "pl"] as const) {
        expect(getModalityCopy(locale, modalityId).voiceSample).toMatch(/^[A-ZŁŚŻŹĆ]/);
      }
    }
  });
});
