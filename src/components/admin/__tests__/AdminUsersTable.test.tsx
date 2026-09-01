import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminUsersResponse } from "@/lib/admin/contracts";
import AdminUsersTable, { getAdminUsersErrorMessage } from "../AdminUsersTable";

const usersResponse: AdminUsersResponse = {
  ok: true,
  type: "admin_users",
  result: {
    filters: {
      emailSearch: "",
      status: "all",
      plan: "all",
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
          premiumGrantedAt: "2026-08-01T10:00:00.000Z",
          premiumGrantedBy: "admin-1",
          createdAt: "2026-06-01T10:00:00.000Z",
          updatedAt: "2026-06-01T10:00:00.000Z",
        },
        accountStatus: "active",
        plan: "premium",
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
          premiumGrantedAt: null,
          premiumGrantedBy: null,
          createdAt: "2026-06-02T10:00:00.000Z",
          updatedAt: "2026-06-07T10:00:00.000Z",
        },
        accountStatus: "blocked",
        plan: "free",
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

  it("distinguishes premium from free accounts and offers the plan actions", () => {
    const html = renderUsers();

    // The plan filter sits next to the status filter.
    expect(html).toContain('name="plan"');
    expect(html).toContain("Bezpłatny");
    expect(html).toContain('data-admin-user-plan="premium"');
    expect(html).toContain('data-admin-user-plan="free"');
    // Premium account → revoke; free account → grant.
    expect(html).toContain("Odbierz premium");
    expect(html).toContain("Nadaj premium");
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
    expect(errorHtml).toContain("nie ma uprawnień administratora");
    expect(emptyHtml).toContain("Brak użytkowników dla wybranych filtrów");
  });

  it("explains every failure code in Polish and falls back to a generic line", () => {
    expect(getAdminUsersErrorMessage("self_target_forbidden")).toBe(
      "Nie możesz zmienić blokady ani planu własnego konta.",
    );
    expect(getAdminUsersErrorMessage("target_not_found")).toContain("Nie znaleziono takiego konta");
    expect(getAdminUsersErrorMessage("write_failed")).toContain("Nie udało się zapisać zmiany");
    expect(getAdminUsersErrorMessage("account_blocked")).toBe(
      "Nie udało się pobrać danych administracyjnych. Spróbuj ponownie za chwilę.",
    );
  });

  it("lets the wide table scroll instead of clipping it, and keeps self-actions disabled", () => {
    const html = renderUsers();

    expect(html).toContain("overflow-x-auto");
    expect(html).not.toContain("overflow-hidden");
    // The signed-in admin (admin-1) cannot block or change the plan of their own row.
    const [, ownRow] = html.split("data-admin-user-row");
    expect(ownRow).toContain("admin@example.com");
    expect((ownRow.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(2);
  });
});
