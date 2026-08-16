import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminUsersResponse } from "@/lib/admin/contracts";
import AdminUsersTable from "../AdminUsersTable";

const usersResponse: AdminUsersResponse = {
  ok: true,
  type: "admin_users",
  result: {
    filters: {
      emailSearch: "",
      status: "all",
      sort: "created_desc",
      page: 1,
      pageSize: 20,
    },
    users: [
      {
        profile: {
          userId: "admin-1",
          email: "admin@example.com",
          accountCreatedAt: "2026-06-01T10:00:00.000Z",
          lastSignInAt: "2026-06-06T10:00:00.000Z",
          lastActivityAt: "2026-06-06T10:00:00.000Z",
          blockedAt: null,
          blockedBy: null,
          blockReasonCode: null,
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        accountStatus: "active",
        counters: {
          totalSessions: 3,
          activeSessions: 1,
          completedSessions: 2,
          approvedSummaries: 1,
        },
      },
      {
        profile: {
          userId: "user-2",
          email: "blocked@example.com",
          accountCreatedAt: "2026-06-02T10:00:00.000Z",
          lastSignInAt: null,
          lastActivityAt: null,
          blockedAt: "2026-06-07T10:00:00.000Z",
          blockedBy: "admin-1",
          blockReasonCode: "policy_violation",
          createdAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-07T10:00:00.000Z",
        },
        accountStatus: "blocked",
        counters: {
          totalSessions: 0,
          activeSessions: 0,
          completedSessions: 0,
          approvedSummaries: 0,
        },
      },
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      totalCount: 2,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  },
};

function renderUsers(response: AdminUsersResponse = usersResponse) {
  return renderToStaticMarkup(<AdminUsersTable initialResponse={response} currentAdminUserId="admin-1" />);
}

describe("AdminUsersTable", () => {
  it("renders search/filter UI, active and blocked states, and explicit controls", () => {
    const html = renderUsers();

    expect(html).toContain("E-mail");
    expect(html).toContain("Status");
    expect(html).toContain("Sortowanie");
    expect(html).toContain("admin@example.com");
    expect(html).toContain("blocked@example.com");
    expect(html).toContain("Aktywne");
    expect(html).toContain("Zablokowane");
    expect(html).toContain("Zablokuj");
    expect(html).toContain("Odblokuj");
    expect(html).toContain("Naruszenie zasad");
  });

  it("does not render export/download controls or private content fields", () => {
    const html = renderUsers();

    expect(html).not.toContain("Eksport");
    expect(html).not.toContain("CSV");
    expect(html).not.toContain("Pobierz");
    expect(html).not.toContain("summaryText");
    expect(html).not.toContain("session_messages");
    expect(html).not.toContain("raw_user_meta_data");
  });

  it("renders stable error and empty states", () => {
    const errorHtml = renderUsers({
      ok: false,
      type: "admin_error",
      code: "not_admin",
    });
    const emptyHtml = renderUsers({
      ok: true,
      type: "admin_users",
      result: {
        ...usersResponse.result,
        users: [],
        pagination: {
          ...usersResponse.result.pagination,
          totalCount: 0,
        },
      },
    });

    expect(errorHtml).toContain("kod: not_admin");
    expect(emptyHtml).toContain("Brak użytkowników dla wybranych filtrów");
  });
});
