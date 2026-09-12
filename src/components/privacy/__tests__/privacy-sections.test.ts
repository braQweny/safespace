import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVACY_SECTION_IDS } from "@/lib/page-copy/privacy-copy";

/**
 * Proza strony prywatności żyje w dwóch partialach Astro. Spis treści i linki
 * z innych stron (`/privacy#ai`) używają neutralnych id, więc oba partiale
 * muszą mieć dokładnie ten sam zestaw sekcji w tej samej kolejności.
 */
function readSectionIds(fileName: string) {
  const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

  return [...source.matchAll(/<section id="([a-z-]+)"/g)].map((match) => match[1]);
}

describe("privacy page partials", () => {
  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])("%s carries every section id in order", (fileName) => {
    expect(readSectionIds(fileName)).toEqual([...PRIVACY_SECTION_IDS]);
  });

  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])(
    "%s describes people cards behind the same flag that ships them: one paragraph in #ai and one deletion bullet",
    (fileName) => {
      const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

      expect(source).toContain('import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode"');
      expect(source.match(/data-people-memory/g)).toHaveLength(2);
      expect(source).toMatch(/<p class="text-ink-soft mt-3" data-people-memory>/);
      expect(source).toMatch(/<li data-people-memory>/);
    },
  );

  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])(
    "%s describes the topic map behind its own flag: one paragraph beside the people cards and one deletion bullet",
    (fileName) => {
      const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

      expect(source).toContain('import { isTopicMapEnabled } from "@/lib/session-flow/topic-map-mode"');
      expect(source.match(/data-topic-map/g)).toHaveLength(2);
      expect(source).toMatch(/<p class="text-ink-soft mt-3" data-topic-map>/);
      expect(source).toMatch(/<li data-topic-map>/);
      // Mapa stoi tuż za kartami osób w obu miejscach.
      expect(source.indexOf("data-people-memory>")).toBeLessThan(source.indexOf("data-topic-map>"));
    },
  );

  it.each(["PrivacyContentPl.astro", "PrivacyContentEn.astro"])(
    "%s describes voice conversations behind the dashboard's voice gate, right after the AI section, with numbers from code",
    (fileName) => {
      const source = readFileSync(resolve(__dirname, "..", fileName), "utf8");

      expect(source).toContain('import { isVoiceStartAvailable } from "@/lib/session-flow/voice-start"');
      expect(source.match(/data-voice-session/g)).toHaveLength(1);
      expect(source).toMatch(/<section id="voice" class="scroll-mt-20" data-voice-session>/);
      // Sekcja stoi między „Jak działa AI” a „Usuwanie i kontrola”, jak w spisie treści.
      expect(source.indexOf('id="ai"')).toBeLessThan(source.indexOf('id="voice"'));
      expect(source.indexOf('id="voice"')).toBeLessThan(source.indexOf('id="deletion"'));
      // Próba, pula i retencja bufora pochodzą z kodu, który je egzekwuje — nigdy z literału w prozie.
      expect(source).toContain("VOICE_TRIAL_DURATION_SECONDS");
      expect(source).toContain("getVoiceMonthlyMinutes()");
      expect(source).toContain("VOICE_BUFFER_RETENTION_MS");
      const voiceSection = source.slice(source.indexOf('id="voice"'), source.indexOf('id="deletion"'));
      expect(voiceSection).not.toMatch(/\b(10|120|7)\s*(min|minut|minutes|dni|days)/);
      // Kluczowe zdania: brak nagrywania, reaktywna ocena, bufor, obie pule.
      expect(voiceSection).toMatch(/WebRTC/);
      expect(voiceSection).toMatch(/Cloudflare/);
      expect(voiceSection).toMatch(/voiceBufferDays/);
      expect(voiceSection).toMatch(/voiceTrialMinutes/);
      expect(voiceSection).toMatch(/voiceMonthlyMinutes/);
    },
  );

  it("keeps the English partial free of Polish letters outside comments", () => {
    const source = readFileSync(resolve(__dirname, "..", "PrivacyContentEn.astro"), "utf8");
    const markup = source.slice(source.lastIndexOf("---") + 3);

    expect(markup).not.toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
  });
});
