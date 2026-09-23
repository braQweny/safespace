// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSessionChrome } from "@/components/hooks/useSessionChrome";
import { LocaleProvider } from "@/components/LocaleProvider";
import SessionEndConfirmDialog from "../SessionEndConfirmDialog";
import { getTimedSessionCopy } from "../timed-session-copy";

const copy = getTimedSessionCopy("en");
const END_LABEL = "End the conversation";

afterEach(() => {
  cleanup();
});

describe("SessionEndConfirmDialog", () => {
  function DialogOnly({
    onCancel,
    onConfirm,
    isEnding = false,
    note = null,
  }: {
    onCancel: () => void;
    onConfirm: () => void;
    isEnding?: boolean;
    note?: string | null;
  }) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    return (
      <LocaleProvider locale="en">
        <SessionEndConfirmDialog
          dialogRef={dialogRef}
          isEnding={isEnding}
          note={note}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </LocaleProvider>
    );
  }

  it("cancels on Escape from any of its buttons and keeps the key from reaching outer layers", async () => {
    const onCancel = vi.fn();
    const outer = vi.fn();
    const user = userEvent.setup();
    render(<DialogOnly onCancel={onCancel} onConfirm={vi.fn()} />);
    document.addEventListener("keydown", outer);

    screen.getByRole("button", { name: copy.confirmEndNow }).focus();
    await user.keyboard("{Escape}");
    screen.getByRole("button", { name: copy.confirmEndCancel }).focus();
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(2);
    // The crisis overlay and other Escape handlers must not close as well.
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("disables ending while the end request is under way but keeps the way back", () => {
    render(<DialogOnly onCancel={vi.fn()} onConfirm={vi.fn()} isEnding />);

    expect(screen.getByRole("button", { name: copy.confirmEndNow }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: copy.confirmEndCancel }).hasAttribute("disabled")).toBe(false);
  });

  it("tells a free account before the decision that ending early still uses the conversation", () => {
    render(<DialogOnly onCancel={vi.fn()} onConfirm={vi.fn()} note={copy.confirmEndFreeNote(3)} />);

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "It still counts as one of your 3 free conversations, even if you end it early.",
    );
  });

  it("adds nothing for accounts without a conversation cap", () => {
    render(<DialogOnly onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole("alertdialog").textContent).not.toContain("free conversations");
  });
});

/*
 * Focus return is not the dialog's own job: `useSessionChrome` owns it and
 * `SessionScreenHeader` wires its refs to the "End the conversation" button
 * (disabled while the dialog is open) and to the dialog. This harness wires
 * the same refs the same way, so it checks the real hook with the real dialog.
 */
function ChromeHarness({ onEnd }: { onEnd: () => void }) {
  const { isConfirmingEnd, requestEnd, cancelEndConfirmation, closeEndConfirmation, confirmEndRef, endButtonRef } =
    useSessionChrome();
  return (
    <LocaleProvider locale="en">
      <button ref={endButtonRef} type="button" onClick={requestEnd} disabled={isConfirmingEnd}>
        {END_LABEL}
      </button>
      {isConfirmingEnd ? (
        <SessionEndConfirmDialog
          dialogRef={confirmEndRef}
          isEnding={false}
          onConfirm={() => {
            closeEndConfirmation();
            onEnd();
          }}
          onCancel={cancelEndConfirmation}
        />
      ) : null}
    </LocaleProvider>
  );
}

describe("ending a conversation with the keyboard", () => {
  it("moves focus into the dialog, and Escape closes it and returns focus to the end button", async () => {
    const user = userEvent.setup();
    render(<ChromeHarness onEnd={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: END_LABEL });

    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: copy.confirmEndAria });
    expect(document.activeElement).toBe(dialog);
    expect(trigger.hasAttribute("disabled")).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus the same way from “Back to the conversation”, but not after ending", async () => {
    const onEnd = vi.fn();
    const user = userEvent.setup();
    render(<ChromeHarness onEnd={onEnd} />);
    const trigger = screen.getByRole("button", { name: END_LABEL });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: copy.confirmEndCancel }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: copy.confirmEndNow }));
    expect(onEnd).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // The conversation is ending; the closing card takes over focus, not the old button.
    expect(document.activeElement).not.toBe(trigger);
  });
});
