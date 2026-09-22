import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SetPasswordForm from "../SetPasswordForm";
import SignInForm from "../SignInForm";
import SignUpForm from "../SignUpForm";
import { SubmitButton } from "../SubmitButton";

describe("auth forms (server render)", () => {
  it("render an empty e-mail field even when a server error asks for a restore", () => {
    for (const markup of [
      renderToStaticMarkup(<SignInForm locale="pl" serverError="Podaj poprawny adres e-mail." />),
      renderToStaticMarkup(<SignUpForm locale="pl" serverError="Podaj poprawny adres e-mail." />),
    ]) {
      // The remembered address lives only in the browser's sessionStorage; the
      // server never knows it and the URL never carries it.
      expect(markup).toContain('name="email"');
      expect(markup).toContain('value=""');
      expect(markup).toContain('role="alert"');
      expect(markup).toContain("Podaj poprawny adres e-mail.");
    }
  });

  it("keep the native POST targets so the forms work without JavaScript", () => {
    expect(renderToStaticMarkup(<SignInForm locale="pl" />)).toContain('action="/api/auth/signin"');
    expect(renderToStaticMarkup(<SignUpForm locale="pl" />)).toContain('action="/api/auth/signup"');
  });
});

describe("SubmitButton", () => {
  it("shows the pending state it is given, because a native POST never reports one to React", () => {
    const idle = renderToStaticMarkup(
      <SubmitButton pending={false} pendingText="Logowanie…" icon={null}>
        Zaloguj się
      </SubmitButton>,
    );
    const pending = renderToStaticMarkup(
      <SubmitButton pending pendingText="Logowanie…" icon={null}>
        Zaloguj się
      </SubmitButton>,
    );

    expect(idle).not.toContain('disabled=""');
    expect(idle).toContain("Zaloguj się");
    expect(pending).toContain('disabled=""');
    expect(pending).toContain("Logowanie…");
    expect(pending).not.toContain("Zaloguj się");
  });

  it("draws the spinner in the button's text colour instead of white", () => {
    // Po zmroku marka jest jasna, a napis ciemny — biały spinner znikał na przycisku.
    const pending = renderToStaticMarkup(
      <SubmitButton pending pendingText="Logowanie…" icon={null}>
        Zaloguj się
      </SubmitButton>,
    );

    expect(pending).toContain("border-t-surface");
    expect(pending).not.toContain("border-white");
  });

  it("starts enabled in every form", () => {
    for (const markup of [
      renderToStaticMarkup(<SignInForm locale="pl" />),
      renderToStaticMarkup(<SignUpForm locale="pl" />),
      renderToStaticMarkup(<SetPasswordForm locale="pl" />),
    ]) {
      const submit = /<button[^>]*type="submit"[^>]*>/.exec(markup)?.[0] ?? "";
      expect(submit).not.toBe("");
      expect(submit).not.toContain('disabled=""');
    }
  });
});
