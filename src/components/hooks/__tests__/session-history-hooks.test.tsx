import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar, type SelectedModalityAvatar } from "@/lib/modalities";
import type { LatestSessionSummaryState, SessionHistoryDetail, SessionHistoryListItem } from "@/lib/session-data/types";
import type { SessionHistoryListResponse } from "@/lib/session-flow/session-history-contract";
import { getInitialHistoryState, useSessionHistoryList } from "../useSessionHistoryList";
import { useSessionHistoryDetail } from "../useSessionHistoryDetail";
import { useSessionSummary } from "../useSessionSummary";
import { useSessionDeletion } from "../useSessionDeletion";

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[1]);

function createHistoryItem(index: number): SessionHistoryListItem {
  return {
    id: `session-${index}`,
    status: "completed",
    startedAt: "2026-06-07T10:00:00.000Z",
    endedAt: "2026-06-07T10:12:00.000Z",
    expiresAt: "2026-06-07T10:15:00.000Z",
    durationBucketSeconds: 900,
    isTrial: true,
    summaryState: "none",
    createdAt: "2026-06-07T10:00:00.000Z",
    updatedAt: "2026-06-07T10:12:00.000Z",
  };
}

function createHistoryResponse(items: SessionHistoryListItem[], page = 1): SessionHistoryListResponse {
  return {
    ok: true,
    type: "session_history_list",
    avatar: selectedAvatar,
    items,
    pagination: {
      page,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: page > 1,
    },
  };
}

function HistoryListProbe(props: {
  selectedAvatar: SelectedModalityAvatar | null;
  page: number;
  initialHistory?: SessionHistoryListResponse | null;
}) {
  const { history } = useSessionHistoryList(props);

  return (
    <div
      data-status={history.status}
      data-count={history.items.length}
      data-error={history.errorCode ?? "none"}
      data-page={history.pagination?.page ?? "none"}
    />
  );
}

function DetailProbe({ initialDetail }: { initialDetail?: SessionHistoryDetail | null }) {
  const { detail, detailStatus } = useSessionHistoryDetail({
    initialDetail,
    onDetailLoaded: () => undefined,
    onDetailError: () => undefined,
  });

  return <div data-status={detailStatus} data-session={detail?.session.id ?? "none"} />;
}

function SummaryProbe({ initialSummary }: { initialSummary?: LatestSessionSummaryState | null }) {
  const { summaryState, summaryStatus, summaryErrorCode } = useSessionSummary(initialSummary);

  return <div data-kind={summaryState.kind} data-status={summaryStatus} data-error={summaryErrorCode ?? "none"} />;
}

function DeletionProbe({ initialConfirmSessionId }: { initialConfirmSessionId?: string | null }) {
  const { pendingDeleteId, deletingId } = useSessionDeletion({
    initialConfirmSessionId,
    onDeleted: () => undefined,
    onDeleteError: () => undefined,
  });

  return <div data-pending={pendingDeleteId ?? "none"} data-deleting={deletingId ?? "none"} />;
}

describe("getInitialHistoryState", () => {
  it("is idle without a selected avatar", () => {
    const state = getInitialHistoryState(null, 1, createHistoryResponse([createHistoryItem(1)]));

    expect(state.status).toBe("idle");
    expect(state.items).toEqual([]);
    expect(state.pagination).toBeNull();
  });

  it("hydrates a matching initial response and caps items at the page size", () => {
    const items = Array.from({ length: 25 }, (_, index) => createHistoryItem(index + 1));
    const state = getInitialHistoryState(selectedAvatar, 1, createHistoryResponse(items));

    expect(state.status).toBe("ready");
    expect(state.items).toHaveLength(20);
    expect(state.errorCode).toBeNull();
  });

  it("maps an initial failure response to the error state", () => {
    const state = getInitialHistoryState(selectedAvatar, 3, {
      ok: false,
      type: "session_history_error",
      code: "session_data_unavailable",
    });

    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("session_data_unavailable");
    expect(state.pagination).toEqual({
      page: 3,
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("starts loading when the initial response does not match the requested page", () => {
    const state = getInitialHistoryState(selectedAvatar, 2, createHistoryResponse([createHistoryItem(1)], 1));

    expect(state.status).toBe("loading");
    expect(state.items).toEqual([]);
  });
});

describe("useSessionHistoryList", () => {
  it("exposes the hydrated state during server rendering", () => {
    const html = renderToStaticMarkup(
      <HistoryListProbe
        selectedAvatar={selectedAvatar}
        page={1}
        initialHistory={createHistoryResponse([createHistoryItem(1), createHistoryItem(2)])}
      />,
    );

    expect(html).toContain('data-status="ready"');
    expect(html).toContain('data-count="2"');
    expect(html).toContain('data-error="none"');
    expect(html).toContain('data-page="1"');
  });

  it("exposes the idle state without an avatar", () => {
    const html = renderToStaticMarkup(<HistoryListProbe selectedAvatar={null} page={1} initialHistory={null} />);

    expect(html).toContain('data-status="idle"');
    expect(html).toContain('data-count="0"');
  });
});

describe("useSessionHistoryDetail", () => {
  it("starts ready with an initial detail and idle without one", () => {
    const detail: SessionHistoryDetail = {
      session: createHistoryItem(1),
      messages: [],
      summary: {
        kind: "none",
      },
    };

    const withDetail = renderToStaticMarkup(<DetailProbe initialDetail={detail} />);
    const withoutDetail = renderToStaticMarkup(<DetailProbe />);

    expect(withDetail).toContain('data-status="ready"');
    expect(withDetail).toContain('data-session="session-1"');
    expect(withoutDetail).toContain('data-status="idle"');
    expect(withoutDetail).toContain('data-session="none"');
  });
});

describe("useSessionSummary", () => {
  it("starts from the provided summary state and defaults to none", () => {
    const preview: LatestSessionSummaryState = {
      kind: "preview",
      summary: {
        id: "summary-1",
        sessionId: "session-1",
        summaryText: "Tekst podsumowania.",
        status: "draft",
        isVisible: true,
        revision: 1,
        createdAt: "2026-06-07T10:12:00.000Z",
        updatedAt: "2026-06-07T10:12:00.000Z",
      },
    };

    const withPreview = renderToStaticMarkup(<SummaryProbe initialSummary={preview} />);
    const withDefault = renderToStaticMarkup(<SummaryProbe />);

    expect(withPreview).toContain('data-kind="preview"');
    expect(withPreview).toContain('data-status="idle"');
    expect(withPreview).toContain('data-error="none"');
    expect(withDefault).toContain('data-kind="none"');
  });
});

describe("useSessionDeletion", () => {
  it("starts with the initial confirmation id and no in-flight deletion", () => {
    const withConfirm = renderToStaticMarkup(<DeletionProbe initialConfirmSessionId="session-1" />);
    const withoutConfirm = renderToStaticMarkup(<DeletionProbe />);

    expect(withConfirm).toContain('data-pending="session-1"');
    expect(withConfirm).toContain('data-deleting="none"');
    expect(withoutConfirm).toContain('data-pending="none"');
  });
});
