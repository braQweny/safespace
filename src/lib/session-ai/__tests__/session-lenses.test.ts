import { describe, expect, it } from "vitest";
import { SESSION_LENS_IDS, SESSION_LENS_MAX_CHARS, getSessionLensGuidance, isSessionLensId } from "../session-lenses";

describe("session lens catalog", () => {
  it("keeps every module inside its editorial budget so the prompt never has to truncate it", () => {
    for (const lens of SESSION_LENS_IDS) {
      const guidance = getSessionLensGuidance(lens);
      expect(Array.from(guidance).length, lens).toBeLessThanOrEqual(SESSION_LENS_MAX_CHARS);
      expect(guidance.trim()).toBe(guidance);
    }
  });

  it("is written as what to listen for and what to ask, never as a new role for the avatar", () => {
    for (const lens of SESSION_LENS_IDS) {
      const guidance = getSessionLensGuidance(lens);
      expect(guidance).toContain("Listen for:");
      expect(guidance).toContain("Ask");
      // Iga's `Avoid:` forbids switching techniques with every message; a lens
      // that told the avatar to become someone else would fight that guide.
      expect(guidance).not.toMatch(/\b(act as|you are now|become a|switch to|adopt the role)\b/i);
      // Each module ends on its own boundary, not on an instruction to push.
      expect(guidance).toMatch(/\b(never|not|only)\b[^.]*\.$/i);
    }
  });

  it("recognises only the catalog ids", () => {
    expect(SESSION_LENS_IDS).toEqual(["family_of_origin", "work_burnout", "anxiety_avoidance"]);
    for (const lens of SESSION_LENS_IDS) expect(isSessionLensId(lens)).toBe(true);
    for (const value of ["none", "", "Family_of_origin", null, undefined, 1])
      expect(isSessionLensId(value)).toBe(false);
  });
});
