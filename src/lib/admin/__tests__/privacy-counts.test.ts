import { describe, expect, it } from "vitest";
import { exactPrivacyCount, segmentPrivacyCount } from "@/lib/admin/privacy-counts";

describe("privacy-safe admin counts", () => {
  it("keeps global totals exact", () => {
    expect(exactPrivacyCount(3)).toEqual({
      value: 3,
      isSuppressed: false,
      label: "3",
    });
  });

  it("suppresses non-zero segment counts below the threshold", () => {
    expect(segmentPrivacyCount(1)).toEqual({
      value: null,
      isSuppressed: true,
      label: "<5",
    });
    expect(segmentPrivacyCount(4).label).toBe("<5");
  });

  it("shows zero and threshold-edge segment counts exactly", () => {
    expect(segmentPrivacyCount(0)).toMatchObject({
      value: 0,
      isSuppressed: false,
      label: "0",
    });
    expect(segmentPrivacyCount(5)).toMatchObject({
      value: 5,
      isSuppressed: false,
      label: "5",
    });
  });
});
