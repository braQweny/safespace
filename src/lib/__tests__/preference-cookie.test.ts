import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPreferenceCookie,
  PREFERENCE_COOKIE_MAX_AGE_SECONDS,
  takeLegacyStoredChoice,
  writePreferenceCookie,
} from "../preference-cookie";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preference cookie", () => {
  it("is a first-party, year-long, Lax cookie readable by the client, Secure only over HTTPS", () => {
    expect(PREFERENCE_COOKIE_MAX_AGE_SECONDS).toBe(31_536_000);
    expect(buildPreferenceCookie("safespace-start-mode", "voice", true)).toBe(
      "safespace-start-mode=voice; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(buildPreferenceCookie("safespace-topic-view", "graph", false)).toBe(
      "safespace-topic-view=graph; Path=/; Max-Age=31536000; SameSite=Lax",
    );
    // Nie `HttpOnly`: zapisuje je przeglądarka w chwili wyboru.
    expect(buildPreferenceCookie("x", "y", true)).not.toContain("HttpOnly");
  });

  it("never throws when the browser blocks cookies", () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });
    vi.stubGlobal("document", {
      set cookie(_value: string) {
        throw new Error("blocked");
      },
    });

    expect(() => {
      writePreferenceCookie("safespace-start-mode", "voice");
    }).not.toThrow();
  });

  it("reads an old localStorage choice once and removes it", () => {
    const storage = new Map([["legacy", "voice"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
      },
    });

    expect(takeLegacyStoredChoice("legacy")).toBe("voice");
    expect(takeLegacyStoredChoice("legacy")).toBeNull();
  });

  it("treats blocked storage as no old choice", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(takeLegacyStoredChoice("legacy")).toBeNull();
  });
});
