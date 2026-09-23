import { describe, expect, it } from "vitest";
import { isOnOffFlagOn, parseOnOffFlag } from "../on-off-flag";

describe("on/off feature flags", () => {
  it("treats only a literal `on` as enabled", () => {
    expect(parseOnOffFlag("on")).toBe("on");
    expect(parseOnOffFlag(" ON ")).toBe("on");
    for (const value of ["off", "", undefined, null, "true", "1", "yes", "enabled"]) {
      expect(parseOnOffFlag(value)).toBe("off");
    }
  });

  it("reads the value lazily and treats a failing read as off, never on", () => {
    expect(isOnOffFlagOn(() => "on")).toBe(true);
    expect(isOnOffFlagOn(() => "off")).toBe(false);
    expect(isOnOffFlagOn(() => undefined)).toBe(false);
    expect(
      isOnOffFlagOn(() => {
        throw new Error('[vitest] No "FLAG" export is defined on the mock');
      }),
    ).toBe(false);
  });
});
