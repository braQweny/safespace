import { describe, expect, it } from "vitest";
import { shouldSubmitSessionComposerFromKeyboard } from "../SessionComposer";

function keyboardEvent(
  overrides: Partial<Parameters<typeof shouldSubmitSessionComposerFromKeyboard>[0]> = {},
): Parameters<typeof shouldSubmitSessionComposerFromKeyboard>[0] {
  return {
    altKey: false,
    ctrlKey: false,
    key: "Enter",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe("SessionComposer keyboard submit shortcut", () => {
  it("submits with Ctrl+Enter on Windows and Linux platforms", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "Win32")).toBe(true);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "Linux x86_64")).toBe(true);
  });

  it("submits with Cmd+Enter on macOS platforms", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ metaKey: true }), "MacIntel")).toBe(true);
  });

  it("keeps plain Enter and Shift+Enter as textarea input", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent(), "Win32")).toBe(false);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ shiftKey: true }), "MacIntel")).toBe(false);
  });

  it("does not swap platform-specific modifiers", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ metaKey: true }), "Win32")).toBe(false);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "MacIntel")).toBe(false);
  });
});
