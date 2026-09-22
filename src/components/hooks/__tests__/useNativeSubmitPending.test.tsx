// @vitest-environment happy-dom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_SUBMIT_RESET_MS, useNativeSubmitPending } from "../useNativeSubmitPending";

function pageshow(persisted: boolean) {
  const event = new Event("pageshow") as Event & { persisted: boolean };
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useNativeSubmitPending", () => {
  it("stays pending while the page may still be leaving", () => {
    const { result } = renderHook(() => useNativeSubmitPending());
    expect(result.current.isSubmitting).toBe(false);

    act(() => {
      result.current.markSubmitting();
    });
    act(() => {
      vi.advanceTimersByTime(NATIVE_SUBMIT_RESET_MS - 1);
    });

    expect(result.current.isSubmitting).toBe(true);
  });

  it("gives the button back when an aborted navigation never left the page", () => {
    const { result } = renderHook(() => useNativeSubmitPending());

    act(() => {
      result.current.markSubmitting();
    });
    act(() => {
      vi.advanceTimersByTime(NATIVE_SUBMIT_RESET_MS);
    });

    expect(result.current.isSubmitting).toBe(false);
  });

  it("clears the state on a back-forward cache restore, but not on an ordinary page show", () => {
    const { result } = renderHook(() => useNativeSubmitPending());

    act(() => {
      result.current.markSubmitting();
    });
    fireEvent(window, pageshow(false));
    expect(result.current.isSubmitting).toBe(true);

    fireEvent(window, pageshow(true));
    expect(result.current.isSubmitting).toBe(false);
  });

  it("leaves no timer behind when the form goes away", () => {
    const { result, unmount } = renderHook(() => useNativeSubmitPending());

    act(() => {
      result.current.markSubmitting();
    });
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
