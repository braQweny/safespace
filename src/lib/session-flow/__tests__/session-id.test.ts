import { describe, expect, it } from "vitest";
import { parseSessionIdParam } from "@/lib/session-flow/session-id";

describe("parseSessionIdParam", () => {
  it("accepts a canonical uuid and trims surrounding whitespace", () => {
    expect(parseSessionIdParam("5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a")).toBe("5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a");
    expect(parseSessionIdParam(" 5D05A814-22F1-4A1C-9D0A-7E2F9D8C1B2A ")).toBe("5D05A814-22F1-4A1C-9D0A-7E2F9D8C1B2A");
  });

  it("rejects missing, empty, and malformed values", () => {
    expect(parseSessionIdParam(undefined)).toBeNull();
    expect(parseSessionIdParam("")).toBeNull();
    expect(parseSessionIdParam("   ")).toBeNull();
    expect(parseSessionIdParam("session-1")).toBeNull();
    expect(parseSessionIdParam("5d05a814-22f1-4a1c-9d0a")).toBeNull();
    expect(parseSessionIdParam("5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a; drop table")).toBeNull();
  });
});
