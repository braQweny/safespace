import { describe, expect, it, vi } from "vitest";
import type { AdminContext } from "@/lib/admin/types";
import { mapAdminOverviewMetrics, readAdminOverviewMetrics } from "@/lib/admin/aggregates";

function createAdminContext(rpc = vi.fn()): AdminContext {
  return {
    supabase: {
      rpc,
    },
    user: {
      id: "admin-1",
      email: "admin@example.com",
    },
    account: {
      userId: "admin-1",
      status: "active",
      blockedAt: null,
      blockReasonCode: null,
    },
  } as unknown as AdminContext;
}

describe("admin overview aggregates", () => {
  it("maps overview totals and suppresses small segment counts", () => {
    const result = mapAdminOverviewMetrics({
      totalUsers: 12,
      blockedUsers: 2,
      sessionsByLifecycle: {
        active: 3,
        completed: 7,
      },
      activeSessions: 3,
      completedSessions: 7,
      trialSessions: 4,
      followUpSessions: 5,
      approvedSummaries: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        totalUsers: 12,
        blockedUsers: 2,
        activeSessions: {
          isSuppressed: true,
          label: "<5",
        },
        completedSessions: {
          value: 7,
          label: "7",
        },
        followUpSessions: {
          value: 5,
        },
      },
    });

    expect(result.ok && result.data.sessionsByLifecycle.active?.label).toBe("<5");
    expect(JSON.stringify(result)).not.toContain("summaryText");
    expect(JSON.stringify(result)).not.toContain("Prywatna tresc");
  });

  it("reads overview through the safe admin RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        totalUsers: "8",
        blockedUsers: "1",
        sessionsByLifecycle: {},
        activeSessions: "0",
        completedSessions: "5",
        trialSessions: "5",
        followUpSessions: "0",
        approvedSummaries: "0",
      },
      error: null,
    });

    const result = await readAdminOverviewMetrics(createAdminContext(rpc));

    expect(rpc).toHaveBeenCalledWith("get_private_admin_overview");
    expect(result).toMatchObject({
      ok: true,
      data: {
        totalUsers: 8,
        completedSessions: {
          value: 5,
        },
      },
    });
  });
});
