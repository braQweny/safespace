import { describe, expect, it } from "vitest";
import { getSafeReturnPath } from "../return-path";

describe("getSafeReturnPath", () => {
  it("keeps same-origin paths with their query", () => {
    expect(getSafeReturnPath("/")).toBe("/");
    expect(getSafeReturnPath("/privacy")).toBe("/privacy");
    expect(getSafeReturnPath("/dashboard?historyAvatar=cbt-guide")).toBe("/dashboard?historyAvatar=cbt-guide");
    expect(getSafeReturnPath("  /auth/signin  ")).toBe("/auth/signin");
  });

  it("drops the hash", () => {
    expect(getSafeReturnPath("/privacy#data")).toBe("/privacy");
  });

  it("falls back for anything that could leave the site or hit the API", () => {
    for (const value of [
      "//evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "/\\evil.example",
      "/api/session/start",
      "",
      "   ",
      undefined,
      null,
      42,
      `/${"a".repeat(600)}`,
    ]) {
      expect(getSafeReturnPath(value)).toBe("/");
    }
  });

  it("honours a custom fallback", () => {
    expect(getSafeReturnPath("nope", "/dashboard")).toBe("/dashboard");
  });
});
