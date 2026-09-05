import { describe, expect, it } from "vitest";
import { plural } from "../plural";

const PL = { one: "minuta", few: "minuty", many: "minut" };
const EN = { one: "minute", many: "minutes" };

describe("plural", () => {
  it("uses one/many in English", () => {
    expect(plural("en", 1, EN)).toBe("minute");
    expect(plural("en", 0, EN)).toBe("minutes");
    expect(plural("en", 2, EN)).toBe("minutes");
    expect(plural("en", 22, EN)).toBe("minutes");
  });

  it("uses one/few/many in Polish with the 12–14 exception", () => {
    expect(plural("pl", 1, PL)).toBe("minuta");
    expect(plural("pl", 2, PL)).toBe("minuty");
    expect(plural("pl", 4, PL)).toBe("minuty");
    expect(plural("pl", 5, PL)).toBe("minut");
    expect(plural("pl", 12, PL)).toBe("minut");
    expect(plural("pl", 14, PL)).toBe("minut");
    expect(plural("pl", 22, PL)).toBe("minuty");
    expect(plural("pl", 112, PL)).toBe("minut");
    expect(plural("pl", 0, PL)).toBe("minut");
  });

  it("falls back to many when few is not given", () => {
    expect(plural("pl", 3, { one: "rozmowa", many: "rozmów" })).toBe("rozmów");
  });

  it("ignores sign and fraction", () => {
    expect(plural("pl", -3, PL)).toBe("minuty");
    expect(plural("en", 1.4, EN)).toBe("minute");
  });
});
