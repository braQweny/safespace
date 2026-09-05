import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SignInForm from "../SignInForm";
import SignUpForm from "../SignUpForm";

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
