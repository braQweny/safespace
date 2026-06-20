import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import SessionMessages from "../SessionMessages";

const assistantAvatar: SelectedModalityAvatar = {
  modalityId: "cbt",
  avatarId: "cbt-guide",
  modalityName: "Podejscie poznawczo-behawioralne",
  avatarName: "Marek, praktyczny przewodnik",
  assetPath: "/avatars/cbt-guide.png",
  altText: "Awatar Marka",
};

describe("SessionMessages", () => {
  it("renders assistant messages with the selected avatar and formatted markdown", () => {
    const html = renderToStaticMarkup(
      <SessionMessages
        assistantAvatar={assistantAvatar}
        isPending={false}
        messages={[
          {
            id: "message-1",
            role: "assistant",
            sequenceIndex: 1,
            content: ["1. **Co sie dzieje tu i teraz?**", "2. **Czy chodzi o cialo czy glowe?**"].join("\n"),
            createdAt: "2026-06-07T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(html).toContain("Marek, praktyczny przewodnik");
    expect(html).not.toContain("SafeSpace");
    expect(html).not.toContain("**");
    expect(html).toContain("<ol");
    expect(html).toContain("<strong");
  });

  it("renders a short pulsing thinking state while waiting for a response", () => {
    const html = renderToStaticMarkup(<SessionMessages assistantAvatar={assistantAvatar} isPending messages={[]} />);

    expect(html).toContain("Marek myśli");
    expect(html).toContain('aria-label="Marek myśli..."');
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("Odpowiedź trwa");
    expect(html).not.toContain("niestreamingową odpowiedź");
    expect(html).not.toContain("granic bezpieczeństwa");
  });
});
