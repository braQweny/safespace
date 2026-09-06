import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getServerTopicMapView,
  readTopicMapView,
  resetTopicMapViewForTests,
  setTopicMapView,
  subscribeTopicMapView,
} from "../topic-map-view";

function stubWindow(options: { stored?: string | null; wide?: boolean; storageThrows?: boolean }) {
  const storage = new Map<string, string>();
  if (options.stored) storage.set("safespace:topic-map-view", options.stored);
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (options.storageThrows) throw new Error("blocked");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (options.storageThrows) throw new Error("blocked");
        storage.set(key, value);
      },
    },
    matchMedia: (query: string) => ({ matches: query === "(min-width: 768px)" && options.wide === true }),
  });
  return storage;
}

afterEach(() => {
  resetTopicMapViewForTests();
  vi.unstubAllGlobals();
});

describe("topic map view preference", () => {
  it("shows the list on the server and defaults to the map only on a wide screen", () => {
    expect(getServerTopicMapView()).toBe("list");
    stubWindow({ wide: true });
    expect(readTopicMapView()).toBe("graph");
    stubWindow({ wide: false });
    expect(readTopicMapView()).toBe("list");
  });

  it("prefers a remembered choice, remembers a new one and notifies subscribers", () => {
    const storage = stubWindow({ stored: "list", wide: true });
    expect(readTopicMapView()).toBe("list");
    const listener = vi.fn();
    const unsubscribe = subscribeTopicMapView(listener);
    setTopicMapView("graph");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.get("safespace:topic-map-view")).toBe("graph");
    expect(readTopicMapView()).toBe("graph");
    unsubscribe();
    setTopicMapView("list");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps working when the browser blocks storage and ignores unknown stored values", () => {
    stubWindow({ storageThrows: true, wide: false });
    expect(readTopicMapView()).toBe("list");
    setTopicMapView("graph");
    expect(readTopicMapView()).toBe("graph");
    resetTopicMapViewForTests();
    stubWindow({ stored: "carousel", wide: true });
    expect(readTopicMapView()).toBe("graph");
  });
});
