import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getServerTopicMapView,
  migrateLegacyTopicMapView,
  parseTopicMapView,
  readTopicMapView,
  resetTopicMapViewForTests,
  setTopicMapView,
  subscribeTopicMapView,
  TOPIC_MAP_VIEW_COOKIE,
} from "../topic-map-view";

function stubBrowser(options: { stored?: string | null; wide?: boolean; storageThrows?: boolean }) {
  const storage = new Map<string, string>();
  const cookieWrites: string[] = [];
  const mediaListeners = new Set<() => void>();
  if (options.stored) storage.set("safespace:topic-map-view", options.stored);
  vi.stubGlobal("window", {
    location: { protocol: "http:" },
    localStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) throw new Error("blocked");
        return storage.get(key) ?? null;
      },
      removeItem: (key: string) => {
        if (options.storageThrows) throw new Error("blocked");
        storage.delete(key);
      },
    },
    matchMedia: (query: string) => ({
      matches: query === "(min-width: 48rem)" && options.wide === true,
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    }),
  });
  vi.stubGlobal("document", {
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  });
  return { storage, cookieWrites, mediaListeners };
}

afterEach(() => {
  resetTopicMapViewForTests();
  vi.unstubAllGlobals();
});

describe("topic map view preference", () => {
  it("accepts only known views from the cookie", () => {
    expect(parseTopicMapView("graph")).toBe("graph");
    expect(parseTopicMapView("list")).toBe("list");
    expect(parseTopicMapView("carousel")).toBeNull();
    expect(parseTopicMapView(undefined)).toBeNull();
  });

  it("renders the remembered view on the server and nothing screen-dependent without one", () => {
    expect(getServerTopicMapView("graph")).toBe("graph");
    expect(getServerTopicMapView(null)).toBeNull();
  });

  it("resolves a missing choice by width after hydration, like the CSS before it", () => {
    stubBrowser({ wide: true });
    expect(readTopicMapView(null)).toBe("graph");
    stubBrowser({ wide: false });
    expect(readTopicMapView(null)).toBe("list");
    // Wybór z ciasteczka wygrywa z szerokością.
    expect(readTopicMapView("graph")).toBe("graph");
  });

  it("remembers a new choice in a first-party cookie and notifies subscribers", () => {
    const { cookieWrites, mediaListeners } = stubBrowser({ wide: true });
    const listener = vi.fn();
    const unsubscribe = subscribeTopicMapView(listener);
    expect(mediaListeners.size).toBe(1);

    setTopicMapView("list");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readTopicMapView("graph")).toBe("list");
    // Zwykłe http w `astro dev`: bez `Secure`.
    expect(cookieWrites).toEqual([`${TOPIC_MAP_VIEW_COOKIE}=list; Path=/; Max-Age=31536000; SameSite=Lax`]);
    unsubscribe();
    expect(mediaListeners.size).toBe(0);
    setTopicMapView("graph");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("moves an old localStorage choice into the cookie once, unless the cookie already has one", () => {
    const first = stubBrowser({ stored: "list", wide: true });
    migrateLegacyTopicMapView(false);
    expect(readTopicMapView(null)).toBe("list");
    expect(first.cookieWrites).toHaveLength(1);
    expect(first.storage.has("safespace:topic-map-view")).toBe(false);

    resetTopicMapViewForTests();
    const second = stubBrowser({ stored: "list", wide: true });
    migrateLegacyTopicMapView(true);
    expect(readTopicMapView("graph")).toBe("graph");
    expect(second.cookieWrites).toEqual([]);
    expect(second.storage.has("safespace:topic-map-view")).toBe(false);
  });

  it("keeps working when the browser blocks storage and ignores unknown old values", () => {
    stubBrowser({ storageThrows: true, wide: false });
    migrateLegacyTopicMapView(false);
    expect(readTopicMapView(null)).toBe("list");
    setTopicMapView("graph");
    expect(readTopicMapView(null)).toBe("graph");

    resetTopicMapViewForTests();
    stubBrowser({ stored: "carousel", wide: true });
    migrateLegacyTopicMapView(false);
    expect(readTopicMapView(null)).toBe("graph");
  });
});
