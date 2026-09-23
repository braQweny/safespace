// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NATIVE_SUBMIT_RESET_MS } from "@/components/hooks/useNativeSubmitPending";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-validation";
import { getAuthFormCopy } from "../auth-form-copy";
import SetPasswordForm from "../SetPasswordForm";
import SignInForm from "../SignInForm";
import SignUpForm from "../SignUpForm";

const copy = getAuthFormCopy("en");
const PASSWORD = "x".repeat(MIN_PASSWORD_LENGTH);

/*
 * The forms post natively. A submit event that reaches `window` without
 * `preventDefault` is one the browser would send; this listener counts those
 * and then cancels the navigation, which happy-dom would otherwise attempt.
 * React's own listener sits on the root container, so it always runs first.
 */
let sent: string[] = [];

function countNativeSubmissions(event: Event) {
  if (!event.defaultPrevented) {
    sent.push((event.target as HTMLFormElement).getAttribute("action") ?? "");
  }
  event.preventDefault();
}

beforeEach(() => {
  sent = [];
  window.sessionStorage.clear();
  window.addEventListener("submit", countNativeSubmissions);
});

afterEach(() => {
  window.removeEventListener("submit", countNativeSubmissions);
  cleanup();
});

function field(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`no field #${id}`);
  return element;
}

function submitButton() {
  const button = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("no submit button");
  return button;
}

describe("SignInForm", () => {
  it("sends one POST for a double click and shows the pending state until the page leaves", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignInForm locale="en" />);

    await user.type(field("email"), "ala@example.com");
    await user.type(field("password"), PASSWORD);
    await user.dblClick(screen.getByRole("button", { name: copy.signIn }));

    expect(sent).toEqual(["/api/auth/signin"]);
    const button = submitButton();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain(copy.signInPending);

    // Enter in a field while the POST is under way reaches the form, which refuses it.
    const form = button.form;
    if (!form) throw new Error("submit button outside a form");
    fireEvent.submit(form);
    await user.type(field("password"), "{Enter}");
    expect(sent).toEqual(["/api/auth/signin"]);
  });

  it("sends nothing for an invalid form, stays idle, and moves focus to the first invalid field", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignInForm locale="en" />);
    const button = screen.getByRole("button", { name: copy.signIn });

    await user.click(button);

    expect(sent).toEqual([]);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).not.toContain(copy.signInPending);
    expect(document.activeElement).toBe(field("email"));
    expect(field("email").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(copy.errors.emailRequired)).toBeTruthy();

    // With the address fixed, the next failed submit lands on the password.
    await user.type(field("email"), "ala@example.com");
    await user.click(button);

    expect(sent).toEqual([]);
    expect(document.activeElement).toBe(field("password"));
    expect(screen.getByText(copy.errors.passwordRequired)).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(false);

    // And once valid, it goes out exactly once.
    await user.type(field("password"), PASSWORD);
    await user.click(button);
    expect(sent).toEqual(["/api/auth/signin"]);
  });

  it("clears the pending state when the browser restores the page from its back-forward cache", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignInForm locale="en" />);

    await user.type(field("email"), "ala@example.com");
    await user.type(field("password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: copy.signIn }));
    expect(submitButton().disabled).toBe(true);

    const restored = new Event("pageshow") as Event & { persisted: boolean };
    Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);

    expect(submitButton().disabled).toBe(false);
    expect(submitButton().textContent).toContain(copy.signIn);
  });

  it("gives the button back after an aborted navigation, but not before the limit", () => {
    // Synchroniczne `fireEvent` zamiast user-event: jego asynchroniczna otoczka
    // czeka na `setTimeout(0)`, którego podmieniony zegar sam nie puści.
    vi.useFakeTimers();
    try {
      render(<SignInForm locale="en" />);
      fireEvent.change(field("email"), { target: { value: "ala@example.com" } });
      fireEvent.change(field("password"), { target: { value: PASSWORD } });
      fireEvent.click(screen.getByRole("button", { name: copy.signIn }));
      expect(sent).toEqual(["/api/auth/signin"]);

      // Esc albo „Zatrzymaj” nie wysyła stronie zdarzenia; do limitu nic drugiego nie wychodzi.
      act(() => {
        vi.advanceTimersByTime(NATIVE_SUBMIT_RESET_MS - 1);
      });
      expect(submitButton().disabled).toBe(true);
      const form = submitButton().form;
      if (!form) throw new Error("submit button outside a form");
      fireEvent.submit(form);
      expect(sent).toEqual(["/api/auth/signin"]);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(submitButton().disabled).toBe(false);
      expect(submitButton().textContent).toContain(copy.signIn);

      fireEvent.click(submitButton());
      expect(sent).toEqual(["/api/auth/signin", "/api/auth/signin"]);
      expect(submitButton().disabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SignUpForm", () => {
  it("sends one POST for a double click after valid input", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignUpForm locale="en" />);

    await user.type(field("email"), "ala@example.com");
    await user.type(field("password"), PASSWORD);
    await user.type(field("confirmPassword"), PASSWORD);
    await user.dblClick(screen.getByRole("button", { name: copy.signUp }));

    expect(sent).toEqual(["/api/auth/signup"]);
    expect(submitButton().disabled).toBe(true);
    expect(submitButton().textContent).toContain(copy.signUpPending);
  });

  it("focuses the first invalid field in form order and never goes pending", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SignUpForm locale="en" />);

    await user.type(field("email"), "ala@example.com");
    await user.type(field("password"), PASSWORD);
    await user.type(field("confirmPassword"), `${PASSWORD}-different`);
    await user.click(screen.getByRole("button", { name: copy.signUp }));

    expect(sent).toEqual([]);
    expect(document.activeElement).toBe(field("confirmPassword"));
    expect(screen.getByText(copy.errors.passwordsMismatch)).toBeTruthy();
    expect(submitButton().disabled).toBe(false);
  });
});

describe("SetPasswordForm", () => {
  it("focuses the new password when it is too short, then posts once when valid", async () => {
    const user = userEvent.setup({ delay: null });
    render(<SetPasswordForm locale="en" />);
    const button = screen.getByRole("button", { name: copy.savePassword });

    await user.type(field("password"), "abc");
    await user.type(field("confirmPassword"), "abc");
    await user.click(button);

    expect(sent).toEqual([]);
    expect(document.activeElement).toBe(field("password"));
    expect(button.hasAttribute("disabled")).toBe(false);

    await user.clear(field("password"));
    await user.type(field("password"), PASSWORD);
    await user.clear(field("confirmPassword"));
    await user.type(field("confirmPassword"), PASSWORD);
    await user.dblClick(button);

    expect(sent).toEqual(["/api/auth/password"]);
    expect(submitButton().textContent).toContain(copy.savePending);
  });
});
