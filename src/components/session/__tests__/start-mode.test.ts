import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getServerStartMode, readStartMode, resetStartModeForTests, setStartMode } from "../start-mode";

/**
 * Tryb startu jest zapamiętany po stronie klienta jak „Mapa / Lista”: serwer
 * zawsze zaczyna od pisanej, a zapamiętany wybór wchodzi po hydratacji.
 */
describe("start mode", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    resetStartModeForTests();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts written on the server and in a fresh browser", () => {
    expect(getServerStartMode()).toBe("text");
    expect(readStartMode()).toBe("text");
  });

  it("remembers the last choice and ignores an unknown stored value", () => {
    setStartMode("voice");
    expect(readStartMode()).toBe("voice");
    expect(storage.get("safespace:start-mode")).toBe("voice");
    resetStartModeForTests();
    expect(readStartMode()).toBe("voice");
    storage.set("safespace:start-mode", "hologram");
    resetStartModeForTests();
    expect(readStartMode()).toBe("text");
  });

  it("keeps working for the page when the browser blocks storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readStartMode()).toBe("text");
    setStartMode("voice");
    expect(readStartMode()).toBe("voice");
  });
});
