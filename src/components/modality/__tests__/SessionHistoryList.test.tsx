import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import SessionHistoryList, {
  SESSION_STATUS_LEGEND_ORDER,
  formatDateTime,
  getDurationLabel,
  getOpenDetailButtonId,
  sessionStatusLegend,
} from "../SessionHistoryList";

function createItem(overrides: Partial<SessionHistoryListItem> = {}): SessionHistoryListItem {
  return {
    id: "session-1",
    status: "completed",
    startedAt: "2026-06-07T08:00:00.000Z",
    endedAt: "2026-06-07T08:12:00.000Z",
    expiresAt: "2026-06-07T08:15:00.000Z",
    durationBucketSeconds: 900,
    isTrial: true,
    createdAt: "2026-06-07T08:00:00.000Z",
    updatedAt: "2026-06-07T08:12:00.000Z",
    ...overrides,
  };
}

describe("getDurationLabel", () => {
  it("reports the real span instead of the privacy bucket", () => {
    // The bucket is always 900 for trials, so a two-minute conversation used to
    // be labelled "15 min".
    expect(getDurationLabel(createItem({ endedAt: "2026-06-07T08:02:00.000Z" }))).toBe("2 min rozmowy");
  });

  it("does not round a very short conversation up to a minute", () => {
    expect(getDurationLabel(createItem({ endedAt: "2026-06-07T08:00:20.000Z" }))).toBe("krócej niż minutę");
  });

  it("marks a bucket-only duration as an upper bound", () => {
    expect(getDurationLabel(createItem({ startedAt: null, endedAt: null }))).toBe("do 15 min");
  });

  it("falls back when neither a span nor a bucket is available", () => {
    expect(getDurationLabel(createItem({ startedAt: null, endedAt: null, durationBucketSeconds: null }))).toBe(
      "Czas nieustalony",
    );
  });
});

describe("formatDateTime", () => {
  const now = new Date("2026-06-07T20:00:00.000Z");

  it("labels same-day sessions as today", () => {
    expect(formatDateTime("2026-06-07T08:00:00.000Z", now)).toMatch(/^Dzisiaj, /);
  });

  it("labels the previous day as yesterday", () => {
    expect(formatDateTime("2026-06-06T08:00:00.000Z", now)).toMatch(/^Wczoraj, /);
  });

  it("keeps a full date for older sessions", () => {
    const label = formatDateTime("2026-05-30T08:00:00.000Z", now);

    expect(label).not.toMatch(/Dzisiaj|Wczoraj/);
    expect(label).toContain("2026");
  });

  it("stays safe on missing and unparsable timestamps", () => {
    expect(formatDateTime(null, now)).toBe("Brak daty");
    expect(formatDateTime("not-a-date", now)).toBe("Brak daty");
  });
});

function renderList(props: Partial<Parameters<typeof SessionHistoryList>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionHistoryList
      items={[createItem()]}
      selectedSessionId={null}
      pendingDeleteId={null}
      deletingId={null}
      onOpenDetail={() => undefined}
      onRequestDelete={() => undefined}
      onCancelDelete={() => undefined}
      onConfirmDelete={() => undefined}
      {...props}
    />,
  );
}

describe("sessionStatusLegend", () => {
  it("explains every status the list can show", () => {
    const statuses: SessionHistoryListItem["status"][] = ["created", "active", "completed", "expired", "interrupted"];

    for (const status of statuses) {
      expect(sessionStatusLegend[status].label.length).toBeGreaterThan(0);
      expect(sessionStatusLegend[status].description.length).toBeGreaterThan(0);
    }
  });

  it("keeps the visible legend to the statuses a finished or running conversation can have", () => {
    // `created` is a transient start state — the badge still gets a title, but
    // the legend would only confuse.
    expect(SESSION_STATUS_LEGEND_ORDER).toEqual(["active", "completed", "expired", "interrupted"]);
  });

  it("ties the completed status to the explicit end-session action", () => {
    expect(sessionStatusLegend.completed.description).toContain("Zakończ sesję");
    expect(sessionStatusLegend.expired.description).toContain("limit czasu");
    expect(sessionStatusLegend.interrupted.description).toContain("bezpieczeństwa");
    expect(sessionStatusLegend.active.description).toContain("wrócić");
  });
});

describe("SessionHistoryList", () => {
  it("puts the legend explanation on the status badge as a title", () => {
    const html = renderList();

    expect(html).toContain(`title="${sessionStatusLegend.completed.description}"`);
    expect(html).toContain(">Zakończona<");
  });

  it("titles an active row that already ran out of time as expired", () => {
    const html = renderList({
      items: [createItem({ status: "active", endedAt: null, expiresAt: "2000-01-01T00:00:00.000Z" })],
    });

    expect(html).toContain(`title="${sessionStatusLegend.expired.description}"`);
    expect(html).not.toContain(`title="${sessionStatusLegend.active.description}"`);
  });

  it("gives the open button a deterministic id so the detail panel can hand focus back", () => {
    const html = renderList();

    expect(getOpenDetailButtonId("session-1")).toBe("session-history-open-session-1");
    expect(html).toContain('<button id="session-history-open-session-1" type="button"');
  });

  it("renders the delete confirmation as a labelled, focusable group", () => {
    const html = renderList({ pendingDeleteId: "session-1" });
    const headingIdMatch = /aria-labelledby="([^"]+)"/.exec(html);

    expect(headingIdMatch).not.toBeNull();
    expect(html).toContain('role="group"');
    expect(html).toContain('tabindex="-1"');

    const headingId = headingIdMatch?.[1] ?? "";

    expect(html).toContain(`<p id="${headingId}" class="font-semibold">Potwierdź usunięcie rozmowy</p>`);
    expect(html).toContain("Anuluj");
    expect(html).toContain("Potwierdź usunięcie");
  });

  it("uses distinct confirmation heading ids per row", () => {
    const html = renderList({
      items: [createItem({ id: "session-1" }), createItem({ id: "session-2" })],
      pendingDeleteId: "session-2",
    });

    expect(html).toContain('aria-labelledby="session-history-delete-heading-session-2"');
    expect(html).not.toContain('aria-labelledby="session-history-delete-heading-session-1"');
    expect(html).toContain('id="session-history-open-session-1"');
    expect(html).toContain('id="session-history-open-session-2"');
  });

  it("does not render the confirmation group until a delete is requested", () => {
    const html = renderList();

    expect(html).not.toContain('role="group"');
    expect(html).not.toContain("Potwierdź usunięcie rozmowy");
  });
});
