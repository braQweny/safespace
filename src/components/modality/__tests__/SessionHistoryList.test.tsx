import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionHistoryListItem } from "@/lib/session-data/types";
import SessionHistoryList, {
  SESSION_STATUS_LEGEND_ORDER,
  formatDateTime,
  getDurationLabel,
  getOpenDetailButtonId,
  getSessionStatusLegend,
  groupSessionHistoryItemsByDay,
} from "../SessionHistoryList";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const sessionStatusLegend = getSessionStatusLegend("pl");

function createItem(overrides: Partial<SessionHistoryListItem> = {}): SessionHistoryListItem {
  return {
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
    ...overrides,
  };
}

describe("getDurationLabel", () => {
  it("reports the real span instead of the privacy bucket", () => {
    // The bucket is always 900 for trials, so a two-minute conversation used to
    // be labelled "15 min".
    expect(getDurationLabel("pl", createItem({ endedAt: "2026-06-07T08:02:00.000Z" }))).toBe("2 min rozmowy");
  });

  it("does not round a very short conversation up to a minute", () => {
    expect(getDurationLabel("pl", createItem({ endedAt: "2026-06-07T08:00:20.000Z" }))).toBe("krócej niż minutę");
  });

  it("marks a bucket-only duration as an upper bound", () => {
    expect(getDurationLabel("pl", createItem({ startedAt: null, endedAt: null }))).toBe("do 15 min");
  });

  it("falls back when neither a span nor a bucket is available", () => {
    expect(getDurationLabel("pl", createItem({ startedAt: null, endedAt: null, durationBucketSeconds: null }))).toBe(
      "Czas nieustalony",
    );
  });
});

describe("formatDateTime", () => {
  const now = new Date("2026-06-07T20:00:00.000Z");

  it("labels same-day sessions as today", () => {
    expect(formatDateTime("pl", "2026-06-07T08:00:00.000Z", now)).toMatch(/^Dzisiaj, /);
  });

  it("labels the previous day as yesterday", () => {
    expect(formatDateTime("pl", "2026-06-06T08:00:00.000Z", now)).toMatch(/^Wczoraj, /);
  });

  it("keeps a full date for older sessions", () => {
    const label = formatDateTime("pl", "2026-05-30T08:00:00.000Z", now);

    expect(label).not.toMatch(/Dzisiaj|Wczoraj/);
    expect(label).toContain("2026");
  });

  it("stays safe on missing and unparsable timestamps", () => {
    expect(formatDateTime("pl", null, now)).toBe("Brak daty");
    expect(formatDateTime("pl", "not-a-date", now)).toBe("Brak daty");
  });
});

function renderList(props: Partial<Parameters<typeof SessionHistoryList>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionHistoryList items={[createItem()]} selectedSessionId={null} onOpenDetail={() => undefined} {...props} />,
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
    expect(sessionStatusLegend.completed.description).toContain("zakończona przez Ciebie");
    expect(sessionStatusLegend.expired.description).toContain("limit czasu");
    expect(sessionStatusLegend.interrupted.description).toContain("bezpieczeństwa");
    expect(sessionStatusLegend.active.description).toContain("wrócić");
  });
});

describe("SessionHistoryList", () => {
  it("badges only the statuses that differ from an ordinary finished conversation", () => {
    const interrupted = renderList({ items: [createItem({ status: "interrupted" })] });

    expect(interrupted).toContain(`title="${sessionStatusLegend.interrupted.description}"`);
    expect(interrupted).toContain(">Przerwana<");

    // A completed conversation is the default: date, time and duration say
    // everything, so the row stays free of chrome.
    const completed = renderList();

    expect(completed).not.toContain(">Zakończona<");
    expect(completed).not.toContain(`title="${sessionStatusLegend.completed.description}"`);
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

  it("keeps one action per row and no delete control on the list", () => {
    const html = renderList();
    const buttonCount = html.match(/<button/g)?.length ?? 0;

    expect(buttonCount).toBe(1);
    expect(html).not.toContain("Usuń rozmowę");
    expect(html).not.toContain("Potwierdź usunięcie");
  });

  it("makes the whole row the action: time, duration and badges sit inside the button", () => {
    // Na telefonie działała tylko strzałka bez etykiety; godzina i status
    // wyglądały na coś do dotknięcia i nie robiły nic.
    const html = renderList({ items: [createItem({ status: "interrupted", summaryState: "approved" })] });
    const button = /<button[^>]*>([\s\S]*?)<\/button>/.exec(html)?.[1] ?? "";

    // 08:00 UTC to 10:00 w Warszawie: lista pokazuje czas lokalny.
    expect(button).toContain("10:00");
    expect(button).toContain("12 min rozmowy");
    expect(button).toContain(">Przerwana<");
    expect(button).toContain("Podsumowanie");
    expect(button).toContain("Otwórz zapis rozmowy:");
    // Wewnątrz przycisku wolno stać tylko treści frazowej, więc żadnych akapitów.
    expect(button).not.toMatch(/<p[\s>]/);
  });

  it("moves the date into a day heading so rows differ by time, not by a repeated date", () => {
    const today = new Date("2026-06-07T20:00:00.000Z");
    const html = renderList({
      items: [
        createItem({ id: "session-1", startedAt: "2026-06-07T08:00:00.000Z" }),
        createItem({ id: "session-2", startedAt: "2026-06-07T06:30:00.000Z" }),
        createItem({ id: "session-3", startedAt: "2026-05-30T20:02:00.000Z" }),
      ],
    });
    const groups = groupSessionHistoryItemsByDay(
      "pl",
      [
        createItem({ id: "session-1", startedAt: "2026-06-07T08:00:00.000Z" }),
        createItem({ id: "session-2", startedAt: "2026-06-07T06:30:00.000Z" }),
        createItem({ id: "session-3", startedAt: "2026-05-30T20:02:00.000Z" }),
      ],
      today,
    );

    expect(groups.map((group) => group.items.length)).toEqual([2, 1]);
    expect(groups[0]?.label).toBe("Dzisiaj");
    expect(groups[0]?.key).toBe("2026-06-07");
    expect(groups[1]?.label).not.toMatch(/Dzisiaj|Wczoraj/);
    expect(html.match(/<h3/g)?.length).toBe(2);
  });

  it("labels and groups the same days in English", () => {
    const today = new Date("2026-06-07T20:00:00.000Z");
    const groups = groupSessionHistoryItemsByDay(
      "en",
      [
        createItem({ id: "session-1", startedAt: "2026-06-07T08:00:00.000Z" }),
        createItem({ id: "session-3", startedAt: "2026-06-06T20:02:00.000Z" }),
      ],
      today,
    );

    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
    expect(formatDateTime("en", "2026-05-30T08:00:00.000Z", today)).toBe("May 30, 2026, 10:00 AM");
    expect(getDurationLabel("en", createItem({ endedAt: "2026-06-07T08:02:00.000Z" }))).toBe("2 min conversation");
  });

  it("marks what carries over without showing any of its text", () => {
    const approved = renderList({ items: [createItem({ summaryState: "approved" })] });
    const stale = renderList({ items: [createItem({ summaryState: "stale" })] });
    const none = renderList();

    expect(approved).toContain("Podsumowanie");
    expect(stale).toContain("Podsumowanie nieaktualne");
    expect(none).not.toContain("Podsumowanie");
    expect(none).not.toContain("Podsumowanie");
  });

  it("keeps the way back into a running conversation on its row", () => {
    const html = renderList({
      items: [createItem({ status: "active", endedAt: null, expiresAt: "2999-01-01T00:00:00.000Z" })],
    });

    expect(html).toContain("Wróć do rozmowy");
    expect(html).toContain("/dashboard/session?sessionId=session-1");
  });
});

describe("voice conversations in the history list", () => {
  it("marks a voice conversation with a labelled badge that carries its description, and nothing for text", () => {
    const voice = renderToStaticMarkup(
      <SessionHistoryList
        items={[createItem({ mode: "voice" })]}
        selectedSessionId={null}
        onOpenDetail={() => undefined}
      />,
    );
    expect(voice).toContain("data-voice-badge");
    expect(voice).toContain(">Głos<");
    expect(voice).toContain('title="Rozmowa głosowa; zapis powstał z mowy."');

    const text = renderToStaticMarkup(
      <SessionHistoryList items={[createItem()]} selectedSessionId={null} onOpenDetail={() => undefined} />,
    );
    expect(text).not.toContain("data-voice-badge");
    expect(text).not.toContain("Głos");
  });
});
