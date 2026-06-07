import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminOverviewMetrics } from "@/lib/admin/types";
import AdminOverview from "../AdminOverview";

const metrics: AdminOverviewMetrics = {
  totalUsers: 18,
  blockedUsers: 2,
  sessionsByLifecycle: {
    active: {
      value: null,
      isSuppressed: true,
      label: "<5",
    },
    completed: {
      value: 9,
      isSuppressed: false,
      label: "9",
    },
  },
  activeSessions: {
    value: null,
    isSuppressed: true,
    label: "<5",
  },
  completedSessions: {
    value: 9,
    isSuppressed: false,
    label: "9",
  },
  trialSessions: {
    value: 12,
    isSuppressed: false,
    label: "12",
  },
  followUpSessions: {
    value: null,
    isSuppressed: true,
    label: "<5",
  },
  approvedSummaries: {
    value: null,
    isSuppressed: true,
    label: "<5",
  },
};

describe("AdminOverview", () => {
  it("renders overview cards and suppressed small counts without private text", () => {
    const html = renderToStaticMarkup(<AdminOverview metrics={metrics} />);

    expect(html).toContain("Użytkownicy");
    expect(html).toContain("Zablokowane konta");
    expect(html).toContain("&lt;5");
    expect(html).toContain("Statusy sesji");
    expect(html).toContain("Zatwierdzone podsumowania");
    expect(html).not.toContain("summaryText");
    expect(html).not.toContain("Prywatna tresc");
    expect(html).not.toContain("provider");
  });
});
