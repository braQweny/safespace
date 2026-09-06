import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CrisisHelpPanel, CrisisHelpTrigger } from "../CrisisHelpPanel";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

describe("CrisisHelpPanel", () => {
  it("offers dialable crisis numbers without waiting for a safety hard stop", () => {
    const html = renderToStaticMarkup(<CrisisHelpPanel onClose={() => undefined} />);

    expect(html).toContain('href="tel:112"');
    expect(html).toContain('href="tel:800702222"');
    expect(html).toContain('href="tel:988"');
  });

  it("keeps the local-guidance entry unlinked so no dead dialer entry is offered", () => {
    const html = renderToStaticMarkup(<CrisisHelpPanel onClose={() => undefined} />);

    expect(html).toContain("lokalny numer alarmowy");
    expect(html).not.toContain('href="tel:lokalny');
  });

  it("still says the product is not crisis care", () => {
    const html = renderToStaticMarkup(<CrisisHelpPanel onClose={() => undefined} />);

    expect(html).toContain("nie jest pomocą kryzysową");
  });

  it("exposes the trigger as an expandable control", () => {
    const html = renderToStaticMarkup(<CrisisHelpTrigger isOpen={false} onToggle={() => undefined} />);

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="crisis-help-panel"');
    expect(html).toContain("Pomoc teraz");
  });
});

describe("CrisisHelpPanel on a phone", () => {
  it("scrolls on its own so the lower numbers stay reachable inside the fixed-height conversation", () => {
    const html = renderToStaticMarkup(<CrisisHelpPanel onClose={() => undefined} />);

    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("max-h-[calc(100dvh-6rem)]");
  });
});
