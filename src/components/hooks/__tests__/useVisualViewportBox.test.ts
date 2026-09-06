import { describe, expect, it } from "vitest";
import { KEYBOARD_MIN_HEIGHT_PX, resolveVisualViewportBox } from "../useVisualViewportBox";

describe("resolveVisualViewportBox", () => {
  it("stays out of the way when both viewports match (Android with resizes-content)", () => {
    expect(resolveVisualViewportBox({ innerHeight: 410, viewportHeight: 410, offsetTop: 0, scale: 1 })).toBeNull();
  });

  it("ignores the collapsing address bar and scrollbars", () => {
    expect(
      resolveVisualViewportBox({
        innerHeight: 780,
        viewportHeight: 780 - KEYBOARD_MIN_HEIGHT_PX + 1,
        offsetTop: 0,
        scale: 1,
      }),
    ).toBeNull();
  });

  it("returns the visible slice when the keyboard shrinks only the visual viewport", () => {
    expect(resolveVisualViewportBox({ innerHeight: 780, viewportHeight: 410.4, offsetTop: 0, scale: 1 })).toEqual({
      height: 410,
      offsetTop: 0,
    });
  });

  it("carries the pan offset Safari applies to reveal the focused field", () => {
    expect(resolveVisualViewportBox({ innerHeight: 780, viewportHeight: 480, offsetTop: 300.2, scale: 1 })).toEqual({
      height: 480,
      offsetTop: 300,
    });
  });

  it("does not shrink the layout for pinch zoom", () => {
    expect(resolveVisualViewportBox({ innerHeight: 780, viewportHeight: 390, offsetTop: 120, scale: 2 })).toBeNull();
  });

  it("treats unusable measurements as no keyboard", () => {
    expect(
      resolveVisualViewportBox({ innerHeight: 780, viewportHeight: Number.NaN, offsetTop: 0, scale: 1 }),
    ).toBeNull();
    expect(resolveVisualViewportBox({ innerHeight: 780, viewportHeight: 410, offsetTop: -20, scale: 1 })).toEqual({
      height: 410,
      offsetTop: 0,
    });
  });
});
