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
      {...props}
    />,
  );
}

describe("SessionHistoryDetailPanel", () => {
  it("offers a close action next to the read-only title", () => {
    const html = renderPanel();

    expect(html).toContain("Podgląd tylko do odczytu");
    expect(html).toMatch(/<button type="button"[^>]*>(?:(?!<\/button>).)*Zamknij podgląd<\/button>/);
  });

  it("keeps the close action available while a conversation is still loading", () => {
    const html = renderPanel({ detail: null, detailStatus: "loading" });

    expect(html).toContain("Ładowanie rozmowy");
    expect(html).toContain("Zamknij podgląd");
  });

  it("scrolls the transcript inside the panel only in the side-by-side layout", () => {
    const html = renderPanel();

    // On a narrow container the panel sits below the list and the transcript
    // flows with the page — a nested scroll area there is a scroll-in-scroll trap.
    expect(html).toContain('class="@3xl:max-h-[70vh] @3xl:overflow-y-auto"');
    expect(html).not.toMatch(/class="[^"]*(?<![@\w:-])max-h-\[70vh\]/);
    expect(html).not.toMatch(/class="[^"]*(?<![@\w:-])overflow-y-auto/);
    expect(html).toContain("Pelny zapis rozmowy widoczny tylko po otwarciu.");
  });
});
