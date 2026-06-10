import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session-data/auth", () => ({
  getSessionDataContext: vi.fn(),
}));

vi.mock("@/lib/admin/account-access", () => ({
  requireActiveAccountAccess: vi.fn(),
}));

import { adminError, adminOk } from "@/lib/admin/errors";
import type { AccountAccessState } from "@/lib/admin/types";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext } from "@/lib/session-data/types";
import type { SessionDataRouteContext } from "@/lib/session-data/auth";
import {
  getSessionRouteAccessStatus,
  mapAccountAccessFailureCode,
  requireSessionRouteAccess,
  type SessionRouteAccessDependencies,
} from "../route-access";

const routeContext = {} as SessionDataRouteContext;

const sessionContext: SessionDataContext = {
  supabase: {} as SessionDataContext["supabase"],
  user: {
    id: "user-1",
  },
};

const activeAccess: AccountAccessState = {
  userId: "user-1",
  status: "active",
  blockedAt: null,
  blockReasonCode: null,
};

function createDependencies(overrides: Partial<SessionRouteAccessDependencies> = {}): SessionRouteAccessDependencies {
  return {
    getSessionDataContext: vi.fn(() => ok(sessionContext)),
    requireActiveAccountAccess: vi.fn(() => Promise.resolve(adminOk(activeAccess))),
    ...overrides,
  };
}

describe("requireSessionRouteAccess", () => {
  it("returns the owner-bound session data context for an active account", async () => {
    const dependencies = createDependencies();

    const result = await requireSessionRouteAccess(routeContext, dependencies);

    expect(result).toEqual({ ok: true, data: sessionContext });
    expect(dependencies.requireActiveAccountAccess).toHaveBeenCalledWith(routeContext, sessionContext.supabase);
  });

  it("maps a missing user to missing_auth with a 401 status", async () => {
    const dependencies = createDependencies({
      getSessionDataContext: vi.fn(() => sessionDataError("missing_auth")),
    });

    const result = await requireSessionRouteAccess(routeContext, dependencies);

    expect(result).toEqual({
      ok: false,
      error: { code: "missing_auth", status: 401, source: "session_context" },
    });
    expect(dependencies.requireActiveAccountAccess).not.toHaveBeenCalled();
  });

  it("maps an unavailable session data context to a 503 status", async () => {
    const dependencies = createDependencies({
      getSessionDataContext: vi.fn(() => sessionDataError("session_data_unavailable")),
    });

    const result = await requireSessionRouteAccess(routeContext, dependencies);

    expect(result).toEqual({
      ok: false,
      error: { code: "session_data_unavailable", status: 503, source: "session_context" },
    });
  });

  it("maps a blocked account to account_blocked with a 403 status", async () => {
    const dependencies = createDependencies({
      requireActiveAccountAccess: vi.fn(() => Promise.resolve(adminError("account_blocked"))),
    });

    const result = await requireSessionRouteAccess(routeContext, dependencies);

    expect(result).toEqual({
      ok: false,
      error: { code: "account_blocked", status: 403, source: "account_access" },
    });
  });

  it("collapses other account access failures to account_access_unavailable", async () => {
    const dependencies = createDependencies({
      requireActiveAccountAccess: vi.fn(() => Promise.resolve(adminError("admin_data_unavailable"))),
    });

    const result = await requireSessionRouteAccess(routeContext, dependencies);

    expect(result).toEqual({
      ok: false,
      error: { code: "account_access_unavailable", status: 503, source: "account_access" },
    });
  });
});

describe("session route access mappers", () => {
  it("keeps pass-through codes and collapses the rest", () => {
    expect(mapAccountAccessFailureCode("missing_auth")).toBe("missing_auth");
    expect(mapAccountAccessFailureCode("account_blocked")).toBe("account_blocked");
    expect(mapAccountAccessFailureCode("account_access_unavailable")).toBe("account_access_unavailable");
    expect(mapAccountAccessFailureCode("write_failed")).toBe("account_access_unavailable");
  });

  it("maps access failure codes to stable statuses", () => {
    expect(getSessionRouteAccessStatus("missing_auth")).toBe(401);
    expect(getSessionRouteAccessStatus("account_blocked")).toBe(403);
    expect(getSessionRouteAccessStatus("account_access_unavailable")).toBe(503);
    expect(getSessionRouteAccessStatus("session_data_unavailable")).toBe(503);
  });
});
