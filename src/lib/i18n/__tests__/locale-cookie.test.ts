import { describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "../locale";
import { readLocaleCookie, resolveRequestLocale, writeLocaleCookie } from "../locale-cookie";

function cookiesWith(value: string | undefined) {
  return { get: vi.fn((name: string) => (name === LOCALE_COOKIE_NAME && value ? { value } : undefined)) } as never;
}

describe("locale cookie", () => {
  it("reads only an explicit, valid choice", () => {
    expect(readLocaleCookie(cookiesWith("pl"))).toBe("pl");
    expect(readLocaleCookie(cookiesWith("en"))).toBe("en");
    expect(readLocaleCookie(cookiesWith("de"))).toBeNull();
    expect(readLocaleCookie(cookiesWith(undefined))).toBeNull();
  });

  it("resolves the request locale to English without a cookie", () => {
    expect(resolveRequestLocale(cookiesWith(undefined))).toBe("en");
    expect(resolveRequestLocale(cookiesWith("garbage"))).toBe("en");
    expect(resolveRequestLocale(cookiesWith("pl"))).toBe("pl");
  });

  it("writes a long-lived, lax, http-only cookie on the root path", () => {
    const set = vi.fn();

    writeLocaleCookie({ set }, "pl");

    expect(set).toHaveBeenCalledWith(LOCALE_COOKIE_NAME, "pl", {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: false,
    });
  });
});
