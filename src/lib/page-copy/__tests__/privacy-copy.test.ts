import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getPrivacyCopy, getVisiblePrivacySectionIds, PRIVACY_SECTION_IDS } from "../privacy-copy";

/**
 * Sekcja o rozmowach głosowych istnieje tylko wtedy, gdy panel je oferuje;
 * spis treści musi iść za tym samym warunkiem, inaczej odsyła do kotwicy,
 * której na stronie nie ma.
 */
describe("privacy section visibility", () => {
  it("keeps the voice section right after the AI section when voice conversations ship", () => {
    const visible = getVisiblePrivacySectionIds({ voice: true });

    expect(visible).toEqual([...PRIVACY_SECTION_IDS]);
    expect(visible.indexOf("voice")).toBe(visible.indexOf("ai") + 1);
  });

  it("drops only the voice section while voice conversations are switched off", () => {
    const visible = getVisiblePrivacySectionIds({ voice: false });

    expect(visible).toEqual(PRIVACY_SECTION_IDS.filter((sectionId) => sectionId !== "voice"));
    expect(visible).not.toContain("voice");
    expect(visible).toContain("ai");
    expect(visible).toContain("deletion");
  });

  it("names the voice section in both languages", () => {
    expect(getPrivacyCopy("en").sections.voice).toBe("Voice conversations");
    expect(getPrivacyCopy("pl").sections.voice).toBe("Rozmowy głosowe");
  });

  it("renders the table of contents from the visible ids under the dashboard's voice gate", () => {
    const page = readFileSync(resolve(__dirname, "../../../pages/privacy.astro"), "utf8");

    expect(page).toContain('import { isVoiceStartAvailable } from "@/lib/session-flow/voice-start"');
    expect(page).toContain("getVisiblePrivacySectionIds({ voice: isVoiceStartAvailable() })");
    expect(page).not.toMatch(/PRIVACY_SECTION_IDS\.map/);
  });
});
