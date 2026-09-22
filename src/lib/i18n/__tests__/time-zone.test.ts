import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, parseTimeZone, resolveRequestTimeZone, TIME_ZONE_COOKIE_NAME } from "../time-zone";

function cookies(values: Record<string, string>) {
  // Jak w `locale-cookie.test.ts`: `resolveRequestTimeZone` czyta tylko `.value`.
  return { get: (name: string) => (name in values ? { value: values[name] } : undefined) } as never;
}

describe("time zone cookie", () => {
  it("accepts IANA zones the runtime knows", () => {
    expect(parseTimeZone("America/New_York")).toBe("America/New_York");
    expect(parseTimeZone("Europe/London")).toBe("Europe/London");
    expect(parseTimeZone("UTC")).toBe("UTC");
    expect(parseTimeZone("Etc/GMT+5")).toBe("Etc/GMT+5");
  });

  it("rejects anything Intl does not know or that is not a zone name", () => {
    expect(parseTimeZone("Mars/Olympus_Mons")).toBeNull();
    expect(parseTimeZone("")).toBeNull();
    expect(parseTimeZone("+01:00")).toBeNull();
    expect(parseTimeZone("Europe/Warsaw; Path=/")).toBeNull();
    expect(parseTimeZone(`A${"b".repeat(80)}`)).toBeNull();
    expect(parseTimeZone(undefined)).toBeNull();
    expect(parseTimeZone(42)).toBeNull();
  });

  it("resolves the request zone from the cookie and falls back to Warsaw", () => {
    expect(TIME_ZONE_COOKIE_NAME).toBe("safespace-tz");
    expect(resolveRequestTimeZone(cookies({ [TIME_ZONE_COOKIE_NAME]: "America/Chicago" }))).toBe("America/Chicago");
    expect(resolveRequestTimeZone(cookies({}))).toBe(DEFAULT_TIME_ZONE);
    expect(resolveRequestTimeZone(cookies({ [TIME_ZONE_COOKIE_NAME]: "Not/AZone" }))).toBe("Europe/Warsaw");
  });
});
