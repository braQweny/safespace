import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  migrateLegacyStartMode,
  parseStartMode,
  readStartMode,
  resetStartModeForTests,
  setStartMode,
  START_MODE_COOKIE,
  subscribeStartMode,
} from "../start-mode";

/**
 * Tryb startu jest zapamiętany w ciasteczku: serwer renderuje wybór od razu
 * (`initialMode`), więc hydratacja nie przeskakuje z pisanej na głosową.
 */
describe("start mode", () => {
  const storage = new Map<string, string>();
  const cookieWrites: string[] = [];

  function stubBrowser(options: { storageThrows?: boolean; protocol?: string } = {}) {
    vi.stubGlobal("window", {
      location: { protocol: options.protocol ?? "https:" },
      localStorage: {
        getItem: (key: string) => {
          if (options.storageThrows) throw new Error("blocked");
          return storage.get(key) ?? null;
        },
        setItem: (key: string, value: string) => {
          if (options.storageThrows) throw new Error("blocked");
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          if (options.storageThrows) throw new Error("blocked");
          storage.delete(key);
        },
      },
    });
    vi.stubGlobal("document", {
      set cookie(value: string) {
        cookieWrites.push(value);
      },
    });
  }

  beforeEach(() => {
    storage.clear();
    cookieWrites.length = 0;
    resetStartModeForTests();
    stubBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only known modes from the cookie", () => {
    expect(parseStartMode("voice")).toBe("voice");
    expect(parseStartMode("text")).toBe("text");
    expect(parseStartMode("hologram")).toBeNull();
    expect(parseStartMode(undefined)).toBeNull();
  });

  it("starts from the mode the server read, written without one", () => {
    expect(readStartMode(null)).toBe("text");
    expect(readStartMode("voice")).toBe("voice");
  });

  it("remembers a new choice in a first-party cookie and notifies the card", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStartMode(listener);

    setStartMode("voice");

    expect(readStartMode("text")).toBe("voice");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(cookieWrites).toEqual([`${START_MODE_COOKIE}=voice; Path=/; Max-Age=31536000; SameSite=Lax; Secure`]);
    unsubscribe();
  });

  it("moves an old localStorage choice into the cookie once and drops the key", () => {
    storage.set("safespace:start-mode", "voice");

    migrateLegacyStartMode(false);

    expect(readStartMode(null)).toBe("voice");
    expect(cookieWrites).toEqual([`${START_MODE_COOKIE}=voice; Path=/; Max-Age=31536000; SameSite=Lax; Secure`]);
    expect(storage.has("safespace:start-mode")).toBe(false);
  });

  it("lets an existing cookie win over the old key, but still drops the key", () => {
    storage.set("safespace:start-mode", "voice");

    migrateLegacyStartMode(true);

    expect(readStartMode("text")).toBe("text");
    expect(cookieWrites).toEqual([]);
    expect(storage.has("safespace:start-mode")).toBe(false);
  });

  it("ignores an unknown old value", () => {
    storage.set("safespace:start-mode", "hologram");

    migrateLegacyStartMode(false);

    expect(readStartMode(null)).toBe("text");
    expect(cookieWrites).toEqual([]);
  });

  it("keeps working for the page when the browser blocks storage and cookies", () => {
    stubBrowser({ storageThrows: true });
    vi.stubGlobal("document", {
      set cookie(_value: string) {
        throw new Error("blocked");
      },
    });

    migrateLegacyStartMode(false);
    expect(readStartMode(null)).toBe("text");
    setStartMode("voice");
    expect(readStartMode(null)).toBe("voice");
  });
});
