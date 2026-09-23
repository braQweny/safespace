import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionClosingCard, { shouldClosingCardTakeFocus } from "../SessionClosingCard";

describe("SessionClosingCard", () => {
  it("lets its heading receive focus programmatically without joining the tab order", () => {
    // Pole pisania znika razem z końcem rozmowy; bez celu fokus spadał na
    // `<body>`, a czytnik ekranu nie mówił nic.
    const html = renderToStaticMarkup(
      <SessionClosingCard title="Rozmowa zakończona" body="Dziękuję." remainingSessionsCopy={null} />,
    );

    expect(html).toMatch(/<h2 tabindex="-1" class="[^"]*focus:outline-none[^"]*">Rozmowa zakończona<\/h2>/);
  });

  it("offers one step back to the dashboard and no link to a transcript that is already on screen", () => {
    // Zapis stoi tuż pod kartą; osobny link „Otwórz zapis” był trzecim wyjściem
    // z tego samego ekranu.
    const html = renderToStaticMarkup(
      <SessionClosingCard
        title="Rozmowa zakończona"
        body="Dziękuję."
        remainingSessionsCopy={null}
        actions={<a href="/dashboard/avatar">Zmień perspektywę</a>}
      />,
    );

    expect(html.match(/href="\/dashboard"/g)).toHaveLength(1);
    expect(html).not.toContain("?session=");
    expect(html).toContain('href="/dashboard/avatar"');
  });
});

describe("shouldClosingCardTakeFocus", () => {
  it("takes focus when a conversation ends in front of the user", () => {
    expect(shouldClosingCardTakeFocus("active", null)).toBe(true);
    expect(shouldClosingCardTakeFocus("active", "info")).toBe(true);
  });

  it("leaves focus alone when the page opens on a conversation that already ended", () => {
    for (const kind of ["completed", "expired", "interrupted"] as const) {
      expect(shouldClosingCardTakeFocus(kind, null)).toBe(false);
    }
  });

  it("leaves focus on the crisis numbers after a safety stop", () => {
    expect(shouldClosingCardTakeFocus("active", "hard_stop")).toBe(false);
  });
});
