import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionSafetyNotice from "../SessionSafetyNotice";

describe("SessionSafetyNotice", () => {
  it("renders hard-stop copy and crisis resources", () => {
    const html = renderToStaticMarkup(
      <SessionSafetyNotice
        variant="hard_stop"
        copy={{
          title: "Nie mozemy kontynuowac zwyklej symulacji",
          body: "Ta wiadomosc moze dotyczyc pilnego zagrozenia.",
          nextSteps: ["Skontaktuj sie z lokalnym wsparciem kryzysowym."],
        }}
        crisisResources={[
          {
            id: "pl",
            label: "Polska",
            contacts: [
              {
                kind: "emergency_number",
                label: "Numer alarmowy 112",
                value: "112",
                description: "W pilnym zagrozeniu wybierz numer alarmowy.",
              },
            ],
            note: "Zasoby informacyjne.",
          },
        ]}
      />,
    );

    expect(html).toContain("Nie mozemy kontynuowac zwyklej symulacji");
    expect(html).toContain("Numer alarmowy 112");
  });

  it("does not render a dynamic notice when caution has no visible copy", () => {
    const html = renderToStaticMarkup(<SessionSafetyNotice variant="info" copy={null} />);

    expect(html).toBe("");
  });
});
