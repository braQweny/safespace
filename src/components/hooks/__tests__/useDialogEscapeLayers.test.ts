import { describe, expect, it, vi } from "vitest";
import { createDialogEscapeLayers, handleDialogCancel } from "../useDialogEscapeLayers";

function cancelEvent(cancelable: boolean) {
  return { cancelable, preventDefault: vi.fn() };
}

describe("dialog escape layers", () => {
  it("dismisses the most recently opened layer first", () => {
    const layers = createDialogEscapeLayers();
    const calls: string[] = [];
    layers.push(() => calls.push("forget"));
    layers.push(() => calls.push("delete-fact"));

    expect(layers.dismissTop()).toBe(true);
    expect(calls).toEqual(["delete-fact"]);
  });

  it("forgets a layer once it unregisters", () => {
    const layers = createDialogEscapeLayers();
    const dismiss = vi.fn();
    const unregister = layers.push(dismiss);

    unregister();

    expect(layers.dismissTop()).toBe(false);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("keeps the same handler registered twice as two layers", () => {
    const layers = createDialogEscapeLayers();
    const dismiss = vi.fn();
    const unregisterFirst = layers.push(dismiss);
    layers.push(dismiss);

    unregisterFirst();
    layers.dismissTop();

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

describe("handleDialogCancel", () => {
  it("closes an open confirmation and keeps the dialog open", () => {
    const layers = createDialogEscapeLayers();
    const dismiss = vi.fn();
    const close = vi.fn();
    const event = cancelEvent(true);
    layers.push(dismiss);

    handleDialogCancel(event, layers, close);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it("closes the dialog when no confirmation is open", () => {
    const close = vi.fn();
    const event = cancelEvent(true);

    handleDialogCancel(event, createDialogEscapeLayers(), close);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("closes everything when the browser will not let the close be stopped", () => {
    // Bez aktywacji użytkownika `cancel` nie jest anulowalny, a przeglądarka i
    // tak zamknie dialog — stan musi pójść za nią, a nie zostać przy potwierdzeniu.
    const layers = createDialogEscapeLayers();
    const dismiss = vi.fn();
    const close = vi.fn();
    layers.push(dismiss);

    handleDialogCancel(cancelEvent(false), layers, close);

    expect(dismiss).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
