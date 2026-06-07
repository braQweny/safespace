import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail, SessionHistoryListItem } from "@/lib/session-data/types";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import AvatarSessionHistory from "../AvatarSessionHistory";

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[1]);

function createHistoryItem(index: number): SessionHistoryListItem {
  const hour = String(8 + (index % 10)).padStart(2, "0");

  return {
    id: `session-${index}`,
    status: "completed",
    startedAt: `2026-06-07T${hour}:00:00.000Z`,
    endedAt: `2026-06-07T${hour}:12:00.000Z`,
    expiresAt: `2026-06-07T${hour}:15:00.000Z`,
    durationBucketSeconds: 900,
    isTrial: true,
    createdAt: `2026-06-07T${hour}:00:00.000Z`,
    updatedAt: `2026-06-07T${hour}:12:00.000Z`,
  };
}

function createHistoryResponse(items: SessionHistoryListItem[]): SessionHistoryListResponse {
  return {
    ok: true,
    type: "session_history_list",
    avatar: selectedAvatar,
    items,
    pagination: {
      page: 1,
      pageSize: 20,
      hasNextPage: true,
      hasPreviousPage: true,
    },
  };
}

function renderHistory(props: Partial<Parameters<typeof AvatarSessionHistory>[0]> = {}) {
  return renderToStaticMarkup(
    <AvatarSessionHistory
      selectedAvatar={selectedAvatar}
      page={1}
      onPageChange={() => undefined}
      initialHistory={createHistoryResponse([createHistoryItem(1)])}
      {...props}
    />,
  );
}

describe("AvatarSessionHistory", () => {
  it("renders at most 20 safe list items without message previews", () => {
    const items = Array.from({ length: 21 }, (_, index) => {
      const item = createHistoryItem(index + 1);
      return {
        ...item,
        content: "Prywatna tresc listy nie moze byc widoczna.",
        preview: "Preview rozmowy nie moze byc widoczne.",
      } as SessionHistoryListItem;
    });
    const html = renderHistory({
      initialHistory: createHistoryResponse(items),
    });

    expect(html.match(/data-history-item=/g)?.length).toBe(20);
    expect(html).toContain("Historia rozmów");
    expect(html).toContain("Zakończona");
    expect(html).not.toContain("Prywatna tresc listy");
    expect(html).not.toContain("Preview rozmowy");
    expect(html).not.toContain("session-21");
  });

  it("renders selected-avatar labels, pagination controls, and read-only detail affordances", () => {
    const detail: SessionHistoryDetail = {
      session: createHistoryItem(1),
      messages: [
        {
          id: "message-1",
          role: "assistant",
          sequenceIndex: 1,
          content: "Pelny zapis rozmowy widoczny tylko po otwarciu.",
          createdAt: "2026-06-07T10:00:00.000Z",
        },
      ],
      summary: {
        kind: "none",
      },
    };
    const html = renderHistory({
      initialDetail: detail,
    });

    expect(html).toContain("Marek, praktyczny przewodnik");
    expect(html).toContain("Podejscie poznawczo-behawioralne");
    expect(html).toContain("Poprzednia");
    expect(html).toContain("Następna");
    expect(html).toContain("Podgląd tylko do odczytu");
    expect(html).toContain("Pelny zapis rozmowy");
    expect(html).not.toContain("Wyślij");
    expect(html).not.toContain("Rozpocznij");
  });

  it("renders summary preview only in detail and requires explicit approval", () => {
    const html = renderHistory({
      initialDetail: {
        session: createHistoryItem(1),
        messages: [
          {
            id: "message-1",
            role: "user",
            sequenceIndex: 1,
            content: "Pelny zapis rozmowy widoczny tylko po otwarciu.",
            createdAt: "2026-06-07T10:00:00.000Z",
          },
        ],
        summary: {
          kind: "preview",
          summary: {
            id: "summary-1",
            sessionId: "session-1",
            summaryText: "Widoczne podsumowanie do sprawdzenia przed uzyciem.",
            status: "draft",
            isVisible: true,
            revision: 1,
            createdAt: "2026-06-07T10:12:00.000Z",
            updatedAt: "2026-06-07T10:12:00.000Z",
          },
        },
      },
    });

    expect(html).toContain("Preview do zatwierdzenia");
    expect(html).toContain("Widoczne podsumowanie do sprawdzenia przed uzyciem.");
    expect(html).toContain("Użyj w kolejnej sesji");
    expect(html).not.toContain("Edytuj");
  });

  it("renders approved, stale, retry, and non-summarizable summary states without list leakage", () => {
    const approvedHtml = renderHistory({
      initialDetail: {
        session: createHistoryItem(1),
        messages: [
          {
            id: "message-1",
            role: "assistant",
            sequenceIndex: 1,
            content: "Pelny zapis detail.",
            createdAt: "2026-06-07T10:00:00.000Z",
          },
        ],
        summary: {
          kind: "approved",
          summary: {
            id: "summary-1",
            sessionId: "session-1",
            summaryText: "Zatwierdzone podsumowanie widoczne tylko w detail.",
            status: "ready",
            isVisible: true,
            revision: 1,
            createdAt: "2026-06-07T10:12:00.000Z",
            updatedAt: "2026-06-07T10:12:00.000Z",
          },
        },
      },
    });
    const staleHtml = renderHistory({
      initialDetail: {
        session: createHistoryItem(1),
        messages: [
          {
            id: "message-1",
            role: "assistant",
            sequenceIndex: 1,
            content: "Pelny zapis detail.",
            createdAt: "2026-06-07T10:00:00.000Z",
          },
        ],
        summary: {
          kind: "stale",
          summary: {
            id: "summary-2",
            sessionId: "session-1",
            summaryText: "Nieaktualne podsumowanie widoczne tylko w detail.",
            status: "stale",
            isVisible: true,
            revision: 2,
            createdAt: "2026-06-07T10:13:00.000Z",
            updatedAt: "2026-06-07T10:13:00.000Z",
          },
        },
      },
    });
    const nonSummarizableHtml = renderHistory({
      initialDetail: {
        session: {
          ...createHistoryItem(1),
          status: "active",
        },
        messages: [],
        summary: {
          kind: "none",
        },
      },
    });

    expect(approvedHtml).toContain("Zatwierdzone");
    expect(approvedHtml).toContain("może zostać użyte jako jawny kontekst");
    expect(staleHtml).toContain("Nieaktualne");
    expect(staleHtml).toContain("nie będzie używana jako kontekst");
    expect(nonSummarizableHtml).toContain("Aktywne albo puste rozmowy nie mogą zostać podsumowane");
    expect(renderHistory()).not.toContain("Zatwierdzone podsumowanie widoczne tylko w detail.");
  });

  it("renders deletion confirmation copy without treating delete as avatar save", () => {
    const html = renderHistory({
      initialConfirmSessionId: "session-1",
    });

    expect(html).toContain("Potwierdź usunięcie rozmowy");
    expect(html).toContain("nie przywraca darmowej próby");
    expect(html).toContain("Anuluj");
    expect(html).toContain("Potwierdź usunięcie");
    expect(html).toContain("Usuń");
  });

  it("renders disabled, empty, and error states from safe props", () => {
    const disabledHtml = renderHistory({
      selectedAvatar: null,
      initialHistory: null,
    });
    const emptyHtml = renderHistory({
      initialHistory: createHistoryResponse([]),
    });
    const errorHtml = renderHistory({
      initialHistory: {
        ok: false,
        type: "session_history_error",
        code: "read_failed",
      },
    });

    expect(disabledHtml).toContain("Wybierz awatara");
    expect(emptyHtml).toContain("Brak zapisanych rozmów");
    expect(errorHtml).toContain("Nie udało się odczytać historii");
  });
});
