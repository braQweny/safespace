import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CrisisResourceRegion } from "@/lib/session-safety/types";
import SessionSafetyNotice from "../SessionSafetyNotice";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const polandRegion: CrisisResourceRegion = {
  id: "pl",
  label: "Polska",
  contacts: [
    {
      kind: "emergency_number",
      label: "Numer alarmowy 112",
      value: "112",
      description: "W pilnym zagrożeniu wybierz numer alarmowy.",
    },
    {
      kind: "crisis_line",
      label: "Centrum Wsparcia",
      value: "800 70 2222",
      description: "Telefon wsparcia psychologicznego.",
    },
  ],
  note: "Te zasoby są informacyjne.",
};

const fallbackRegion: CrisisResourceRegion = {
  id: "local_fallback",
  label: "Poza wymienionymi regionami",
  contacts: [
    {
      kind: "local_guidance",
      label: "Lokalny numer alarmowy",
      value: "lokalny numer alarmowy",
      description: "Skontaktuj się z lokalnym numerem alarmowym.",
    },
  ],
  note: "SafeSpace nie wybiera automatycznie numeru dla Twojej lokalizacji.",
};

const hardStopCopy = {
  title: "Nie możemy kontynuować zwykłej symulacji",
  body: "Ta wiadomość może dotyczyć pilnego zagrożenia.",
  nextSteps: ["Skontaktuj się z lokalnym wsparciem kryzysowym."],
};

describe("SessionSafetyNotice", () => {
  it("renders hard-stop copy and crisis resources", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="hard_stop" copy={hardStopCopy} crisisResources={[polandRegion]} />,
    );

    expect(html).toContain("Nie możemy kontynuować zwykłej symulacji");
    expect(html).toContain("Numer alarmowy 112");
  });

  it("announces a hard stop assertively and makes it focusable", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="hard_stop" copy={hardStopCopy} crisisResources={[polandRegion]} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('tabindex="-1"');
  });

  it("announces non-blocking notices politely without stealing focus", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="retry" copy={{ title: "Ponów", body: "Spróbuj ponownie.", retryLabel: "Ponów" }} />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("tabindex");
  });

  it("turns dialable crisis numbers into tel: links", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="hard_stop" copy={hardStopCopy} crisisResources={[polandRegion]} />,
    );

    expect(html).toContain('href="tel:112"');
    expect(html).toContain('href="tel:800702222"');
  });

  it("keeps local-guidance placeholders as plain text", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="hard_stop" copy={hardStopCopy} crisisResources={[fallbackRegion]} />,
    );

    expect(html).toContain("lokalny numer alarmowy");
    expect(html).not.toContain("tel:");
  });

  it("shows the per-region informational note", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice variant="hard_stop" copy={hardStopCopy} crisisResources={[polandRegion, fallbackRegion]} />,
    );

    expect(html).toContain("Te zasoby są informacyjne.");
    expect(html).toContain("SafeSpace nie wybiera automatycznie numeru dla Twojej lokalizacji.");
  });

  it("does not render a dynamic notice when caution has no visible copy", () => {
    const html = renderToStaticMarkup(<SessionSafetyNotice variant="info" copy={null} />);

    expect(html).toBe("");
  });
});
