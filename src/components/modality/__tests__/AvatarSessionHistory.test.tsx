import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { SessionHistoryDetail, SessionHistoryListItem } from "@/lib/session-data/types";
import type {
  SessionHistoryFailureCode,
  SessionHistoryListResponse,
} from "@/lib/session-flow/session-history-contract";
import AvatarSessionHistory from "../AvatarSessionHistory";
import { SESSION_STATUS_LEGEND_ORDER, sessionStatusLegend } from "../SessionHistoryList";

/*
 * Podgląd, podsumowanie i potwierdzenie usunięcia nie wchodzą do sekcji przez
 * propsy — komponent dochodzi do nich przez hooki, po interakcji. Testy
 * podstawiają więc stan hooków i sprawdzają samo okablowanie: co hook zwróci,
 * to sekcja pokaże, a co sekcja dostanie z podglądu, to przekaże dalej.
 */
interface DetailHookOptions {
  onDetailLoaded: (detail: SessionHistoryDetail) => void;
  onDetailError: (code: SessionHistoryFailureCode) => void;
}

const hookState = vi.hoisted(() => ({
  detail: null as SessionHistoryDetail | null,
  pendingDeleteId: null as string | null,
  detailOptions: null as DetailHookOptions | null,
  syncSummary: vi.fn(),
  resetSummary: vi.fn(),
}));

vi.mock("@/components/hooks/useSessionHistoryDetail", () => ({
  useSessionHistoryDetail: (options: DetailHookOptions) => {
    hookState.detailOptions = options;

    return {
      detail: hookState.detail,
      detailStatus: hookState.detail ? "ready" : "idle",
      openDetail: vi.fn(() => Promise.resolve()),
      clearDetail: vi.fn(),
    };
  },
}));

vi.mock("@/components/hooks/useSessionSummary", () => ({
  useSessionSummary: () => ({
    summaryState: hookState.detail?.summary ?? { kind: "none" },
    summaryStatus: "idle",
    summaryErrorCode: null,
    generateSummary: vi.fn(() => Promise.resolve()),
    approveSummary: vi.fn(() => Promise.resolve()),
    syncSummary: hookState.syncSummary,
    resetSummary: hookState.resetSummary,
  }),
}));

vi.mock("@/components/hooks/useSessionDeletion", () => ({
  useSessionDeletion: () => ({
    pendingDeleteId: hookState.pendingDeleteId,
    deletingId: null,
    requestDelete: vi.fn(),
    cancelDelete: vi.fn(),
    confirmDelete: vi.fn(() => Promise.resolve()),
  }),
}));

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
    summaryState: "none",
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

function createDetail(overrides: Partial<SessionHistoryDetail> = {}): SessionHistoryDetail {
  return {
    session: createHistoryItem(1),
    messages: [],
    summary: { kind: "none" },
    ...overrides,
  };
}

interface HookScenario {
  /** Rozmowa, którą hook podglądu „już wczytał” — tak, jakby ktoś ją otworzył z listy. */
  detail?: SessionHistoryDetail | null;
  /** Rozmowa, dla której hook usuwania czeka na potwierdzenie. */
  pendingDeleteId?: string | null;
}

function renderHistory(props: Partial<Parameters<typeof AvatarSessionHistory>[0]> = {}, scenario: HookScenario = {}) {
  hookState.detail = scenario.detail ?? null;
  hookState.pendingDeleteId = scenario.pendingDeleteId ?? null;

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

function getDetailHookOptions() {
  const options = hookState.detailOptions;

  if (!options) {
    throw new Error("AvatarSessionHistory did not call useSessionHistoryDetail");
  }

  return options;
}

beforeEach(() => {
  hookState.detail = null;
  hookState.pendingDeleteId = null;
  hookState.detailOptions = null;
  hookState.syncSummary.mockClear();
  hookState.resetSummary.mockClear();
});

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

  it("explains the status badges in a collapsed legend next to the list description", () => {
    const html = renderHistory();

    expect(html).toContain("Lista pokazuje tylko datę, status i czas trwania.");
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>Co oznaczają statusy/);

    for (const status of SESSION_STATUS_LEGEND_ORDER) {
      expect(html).toContain(`<dt class="text-ink font-semibold">${sessionStatusLegend[status].label}</dt>`);
      expect(html).toContain(`<dd>— ${sessionStatusLegend[status].description}</dd>`);
    }

    // The badge title and the legend must come from the same map.
    const interruptedHtml = renderHistory({
      initialHistory: createHistoryResponse([{ ...createHistoryItem(1), status: "interrupted" }]),
    });

    expect(interruptedHtml).toContain(`title="${sessionStatusLegend.interrupted.description}"`);
  });

  it("starts without any preview: the server never puts conversation content in the first render", () => {
    const html = renderHistory();

    expect(html).not.toContain("Podgląd tylko do odczytu");
    expect(html).not.toContain("Zamknij podgląd");
    expect(html).not.toContain('class="scroll-mt-20"');
  });

  it("keeps the opened detail panel clear of the sticky header and lets it be closed", () => {
    const html = renderHistory({}, { detail: createDetail() });

    expect(html).toContain('<div class="scroll-mt-20"><aside');
    expect(html).toContain("Zamknij podgląd");
    expect(html).toContain('id="session-history-open-session-1"');
  });

  it("renders selected-avatar labels, pagination controls, and read-only detail affordances", () => {
    const detail = createDetail({
      messages: [
        {
          id: "message-1",
          role: "assistant",
          sequenceIndex: 1,
          content: "Pelny zapis rozmowy widoczny tylko po otwarciu.",
          createdAt: "2026-06-07T10:00:00.000Z",
        },
      ],
    });
    const html = renderHistory({}, { detail });

    expect(html).toContain("Marek, praktyczny przewodnik");
    expect(html).toContain("Podejście poznawczo-behawioralne");
    expect(html).toContain("Poprzednia");
    expect(html).toContain("Następna");
    expect(html).toContain("Podgląd tylko do odczytu");
    expect(html).toContain("Pelny zapis rozmowy");
    expect(html).not.toContain("Wyślij");
    expect(html).not.toContain("Rozpocznij");
  });

  it("hands a loaded detail's summary to the summary hook and clears it when the read fails", () => {
    renderHistory();

    const options = getDetailHookOptions();
    const detail = createDetail({
      summary: {
        kind: "preview",
        summary: {
          id: "summary-1",
          sessionId: "session-1",
          summaryText: "Podsumowanie, które ma trafić do panelu podsumowania.",
          status: "draft",
          isVisible: true,
          revision: 1,
          createdAt: "2026-06-07T10:12:00.000Z",
          updatedAt: "2026-06-07T10:12:00.000Z",
        },
      },
    });

    options.onDetailLoaded(detail);
    expect(hookState.syncSummary).toHaveBeenCalledWith(detail.summary);

    options.onDetailError("session_not_found");
    expect(hookState.resetSummary).toHaveBeenCalledTimes(1);
  });

  it("shows a direct return action for active sessions in the history list", () => {
    const html = renderHistory({
      initialHistory: createHistoryResponse([
        {
          ...createHistoryItem(1),
          status: "active",
          endedAt: null,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      ]),
    });

    expect(html).toContain("Aktywna");
    expect(html).toContain("Pozostało");
    expect(html).toContain('role="timer"');
    expect(html).toContain("Wróć do rozmowy");
    expect(html).toContain('href="/dashboard/session?sessionId=session-1"');
  });

  it("hides the return action when an active history row is already past expiresAt", () => {
    const html = renderHistory({
      initialHistory: createHistoryResponse([
        {
          ...createHistoryItem(1),
          status: "active",
          endedAt: null,
          expiresAt: "2000-01-01T00:00:00.000Z",
        },
      ]),
    });

    expect(html).toContain("Po czasie");
    expect(html).not.toContain("Pozostało");
    expect(html).not.toContain("Wróć do rozmowy");
  });

  it("renders an optional summary preview without requiring manual approval", () => {
    const html = renderHistory(
      {},
      {
        detail: createDetail({
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
        }),
      },
    );

    expect(html).toContain("Podgląd podsumowania");
    expect(html).toContain("Widoczne podsumowanie do sprawdzenia przed uzyciem.");
    expect(html).not.toContain("Przepuść do następnej rozmowy");
    expect(html).not.toContain("Edytuj");
  });

  it("renders approved, stale, retry, and non-summarizable summary states without list leakage", () => {
    const messages: SessionHistoryDetail["messages"] = [
      {
        id: "message-1",
        role: "assistant",
        sequenceIndex: 1,
        content: "Pelny zapis detail.",
        createdAt: "2026-06-07T10:00:00.000Z",
      },
    ];
    const approvedHtml = renderHistory(
      {},
      {
        detail: createDetail({
          messages,
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
        }),
      },
    );
    const staleHtml = renderHistory(
      {},
      {
        detail: createDetail({
          messages,
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
        }),
      },
    );
    const nonSummarizableHtml = renderHistory(
      {},
      {
        detail: createDetail({
          session: {
            ...createHistoryItem(1),
            status: "active",
          },
        }),
      },
    );

    expect(approvedHtml).toContain("Zapisane podsumowanie");
    expect(approvedHtml).toContain("Pamięć awatara obejmuje wszystkie wcześniejsze rozmowy");
    expect(staleHtml).toContain("Ta wersja została zastąpiona");
    expect(staleHtml).toContain("Starsza wersja podsumowania tej rozmowy");
    expect(nonSummarizableHtml).toContain("Aktywne albo puste rozmowy nie mogą zostać podsumowane");
    expect(renderHistory()).not.toContain("Zatwierdzone podsumowanie widoczne tylko w detail.");
  });

  it("confirms a deletion inside the open preview, never from the bare list", () => {
    // Usuwanie przeniosło się do podglądu: wiersze różnią się samą godziną, więc
    // kasowanie z listy było kasowaniem w ciemno.
    const listOnlyHtml = renderHistory({}, { pendingDeleteId: "session-1" });

    expect(listOnlyHtml).not.toContain("Potwierdź usunięcie rozmowy");
    expect(listOnlyHtml).not.toContain("Usuń rozmowę");

    const html = renderHistory({}, { pendingDeleteId: "session-1", detail: createDetail() });

    expect(html).toContain("Usuń rozmowę");
    expect(html).toContain("Potwierdź usunięcie rozmowy");
    expect(html).toContain("nie przywraca darmowej próby");
    expect(html).toContain("Anuluj");
    expect(html).toContain("Potwierdź usunięcie");
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

    expect(disabledHtml).toContain("Wybierz perspektywę");
    expect(emptyHtml).toContain("Brak zapisanych rozmów");
    expect(errorHtml).toContain("Nie udało się odczytać historii");
  });
});
