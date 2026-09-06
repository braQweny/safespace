import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import { getSessionCopy } from "@/lib/session-copy";
import SessionMessages from "../SessionMessages";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const SESSION_TURN_COPY = getSessionCopy("pl").turn;

const assistantAvatar: SelectedModalityAvatar = {
  modalityId: "cbt",
  avatarId: "cbt-guide",
  avatarFirstName: "Marek",
  assetPath: "/avatars/cbt-guide.webp",
};

const assistantMessage = {
  id: "message-1",
  role: "assistant" as const,
  sequenceIndex: 1,
  content: "Od czego chcesz zacząć?",
  createdAt: "2026-06-07T10:00:00.000Z",
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

  it("renders the optimistic user bubble instead of the empty state while a message is pending", () => {
    const html = renderToStaticMarkup(
      <SessionMessages
        assistantAvatar={assistantAvatar}
        isPending
        pendingUserText="Wiadomość wysłana przed odpowiedzią."
        messages={[]}
      />,
    );

    expect(html).toContain("Wiadomość wysłana przed odpowiedzią.");
    // Dymek użytkownika jest rozpoznawalny wizualnie po stronie i kolorze, a dla
    // czytników ekranu po ukrytej etykiecie autora.
    expect(html).toContain('class="sr-only">Ty: <');
    expect(html).not.toContain("Pierwsza wiadomość może być krótka");
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

  it("adds a calm note once the response is taking longer than usual", () => {
    const html = renderToStaticMarkup(
      <SessionMessages assistantAvatar={assistantAvatar} isPending isResponseSlow messages={[]} />,
    );

    expect(html).toContain("Marek myśli");
    expect(html).toContain(
      `role="status" aria-live="polite" class="text-ink-muted text-xs">${SESSION_TURN_COPY.slowResponse}`,
    );
  });

  it("drops the slow note together with the pending state", () => {
    const html = renderToStaticMarkup(
      <SessionMessages assistantAvatar={assistantAvatar} isPending={false} isResponseSlow messages={[]} />,
    );

    expect(html).not.toContain(SESSION_TURN_COPY.slowResponse);
  });

  /*
   * Tylko trwająca rozmowa jest dziennikiem na żywo. Podgląd historii to
   * statyczny zapis — `aria-live` kazałby czytnikowi ekranu odczytać całą
   * rozmowę przy każdym otwarciu.
   */
  it("announces new messages only in the live conversation", () => {
    const live = renderToStaticMarkup(
      <SessionMessages variant="live" assistantAvatar={assistantAvatar} messages={[assistantMessage]} />,
    );
    const preview = renderToStaticMarkup(
      <SessionMessages assistantAvatar={assistantAvatar} messages={[assistantMessage]} />,
    );

    expect(live).toContain('role="log"');
    expect(live).toContain('aria-live="polite"');
    expect(live).toContain('aria-label="Przebieg rozmowy"');
    expect(preview).not.toContain('role="log"');
    expect(preview).not.toContain("aria-live");
    expect(preview).toContain("Od czego chcesz zacząć?");
  });
});

describe("SessionMessages finished variant", () => {
  it("keeps the transcript in the page flow without a live region or its own scroller", () => {
    const html = renderToStaticMarkup(
      <SessionMessages variant="finished" assistantAvatar={assistantAvatar} messages={[assistantMessage]} />,
    );

    expect(html).toContain("Od czego chcesz zacząć?");
    expect(html).not.toContain('role="log"');
    expect(html).not.toContain("aria-live");
    expect(html).not.toContain("overflow-y-auto");
    // Nie karta podglądu historii: zapis stoi pod kartą zamknięcia jak w rozmowie.
    expect(html).not.toContain("min-h-[280px]");
  });
});
