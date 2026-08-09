import { describe, expect, it, vi } from "vitest";
import { CRISIS_RESOURCE_CATALOG } from "../crisis-resources";
import { evaluateSessionSafety } from "../evaluate-session-safety";
import type { ProviderSafetyDecision, SessionSafetyProvider } from "../provider";

vi.mock("../openrouter-classifier", () => ({
  openRouterSafetyProvider: {
    classify: vi.fn(),
  },
}));

describe("crisis resources", () => {
  it("keeps Poland, United States, and local fallback entries available", () => {
    expect(Object.keys(CRISIS_RESOURCE_CATALOG)).toEqual(["pl", "us", "local_fallback"]);
    expect(CRISIS_RESOURCE_CATALOG.pl.contacts.map((contact) => contact.value)).toEqual(["112", "800 70 2222"]);
    expect(CRISIS_RESOURCE_CATALOG.us.contacts.map((contact) => contact.value)).toEqual(["988", "911"]);
    expect(CRISIS_RESOURCE_CATALOG.local_fallback.contacts).toHaveLength(1);
  });

  it("returns hard-stop resources without claiming SafeSpace contacted emergency services", async () => {
    const provider: SessionSafetyProvider = {
      classify: vi.fn(() =>
        Promise.resolve<ProviderSafetyDecision>({
          risk: "crisis",
          action: "hard_stop",
          reasonCode: "harm_to_others_signal",
        }),
      ),
    };

    const decision = await evaluateSessionSafety(
      {
        currentUserMessage: "To jest testowa tresc dla granicy bezpieczenstwa.",
      },
      { provider },
    );

    const combinedText = [
      decision.copy?.title,
      decision.copy?.body,
      ...decision.crisisResources.flatMap((resource) => [
        resource.label,
        resource.note,
        ...resource.contacts.flatMap((contact) => [contact.label, contact.value, contact.description]),
      ]),
    ].join(" ");

    expect(decision.action).toBe("hard_stop");
    expect(decision.crisisResources.map((resource) => resource.id)).toEqual(["pl", "us", "local_fallback"]);
    expect(decision.copy?.body).toContain("nie kontaktuje służb");
    expect(combinedText).not.toMatch(/SafeSpace (kontaktuje|powiadamia|wzywa)/i);
    expect(combinedText).not.toMatch(/(wezwali|powiadomili|skontaktowali)(smy|śmy)/i);
  });
});
