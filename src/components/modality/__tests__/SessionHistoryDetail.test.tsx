import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail } from "@/lib/session-data/types";
import SessionHistoryDetailPanel from "../SessionHistoryDetail";

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[1]);

const detail: SessionHistoryDetail = {
  session: {
    id: "session-1",
    status: "completed",
    startedAt: "2026-06-07T08:00:00.000Z",
    endedAt: "2026-06-07T08:12:00.000Z",
    expiresAt: "2026-06-07T08:15:00.000Z",
    durationBucketSeconds: 900,
    isTrial: true,
    summaryState: "none",
    createdAt: "2026-06-07T08:00:00.000Z",
    updatedAt: "2026-06-07T08:12:00.000Z",
  },
  messages: [
    {
      id: "message-1",
      role: "assistant",
      sequenceIndex: 1,
      content: "Pelny zapis rozmowy widoczny tylko po otwarciu.",
      createdAt: "2026-06-07T08:00:00.000Z",
    },
  ],
  summary: { kind: "none" },
};

function renderPanel(props: Partial<Parameters<typeof SessionHistoryDetailPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionHistoryDetailPanel
      detail={detail}
      detailStatus="ready"
      selectedAvatar={selectedAvatar}
      summaryState={detail.summary}
      summaryStatus="idle"
      summaryErrorCode={null}
      canSummarize
      onGenerateSummary={() => undefined}
      onApproveSummary={() => undefined}
      onClose={() => undefined}
      isConfirmingDelete={false}
      isDeleting={false}
      onRequestDelete={() => undefined}
      onCancelDelete={() => undefined}
      onConfirmDelete={() => undefined}
      {...props}
    />,
  );
}

describe("SessionHistoryDetailPanel", () => {
  it("offers a close action next to the read-only title", () => {
    const html = renderPanel();

    expect(html).toContain("Tylko do odczytu");
    expect(html).toMatch(/<button type="button"[^>]*>(?:(?!<\/button>).)*Zamknij<\/button>/);
  });

  it("keeps the close action available while a conversation is still loading", () => {
    const html = renderPanel({ detail: null, detailStatus: "loading" });

    expect(html).toContain("Ładowanie rozmowy");
    expect(html).toContain("Zamknij");
  });

  it("keeps one scroll area and collapses the optional summary", () => {
    const html = renderPanel();

    // Całe okno przewija się w dialogu rodzica, bez drugiego scrolla w zapisie.
    expect(html).not.toContain("overflow-y-auto");
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Podsumowanie tej rozmowy/);
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain("Pelny zapis rozmowy widoczny tylko po otwarciu.");
  });

  it("owns the delete action, so a conversation is removed with its content on screen", () => {
    const html = renderPanel();

    expect(html).toContain("Usuń rozmowę");
    expect(html).not.toContain("Potwierdź usunięcie rozmowy");
  });

  it("renders the delete confirmation as a labelled, focusable group", () => {
    const html = renderPanel({ isConfirmingDelete: true });
    const headingIdMatch = /aria-labelledby="([^"]+)"/.exec(html);

    expect(headingIdMatch).not.toBeNull();
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="-1"');

    const headingId = headingIdMatch?.[1] ?? "";

    expect(html).toContain(`<p id="${headingId}" class="font-semibold">Potwierdź usunięcie rozmowy</p>`);
    expect(html).toContain("Anuluj");
    expect(html).toContain("Potwierdź usunięcie");
    expect(html).toContain("nie przywraca darmowej próby");
  });

  it("hides the delete action while no conversation is loaded", () => {
    const html = renderPanel({ detail: null, detailStatus: "loading" });

    expect(html).not.toContain("Usuń rozmowę");
  });
});
