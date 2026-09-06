import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/session-data/errors";

const { requireSessionRouteAccess, prepareOwnedPeopleMemory, isPeopleMemoryEnabled, logOperationalEvent } = vi.hoisted(
  () => ({
    requireSessionRouteAccess: vi.fn(),
    prepareOwnedPeopleMemory: vi.fn(),
    isPeopleMemoryEnabled: vi.fn(() => true),
    logOperationalEvent: vi.fn(),
  }),
);
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-flow/people-memory", () => ({ prepareOwnedPeopleMemory }));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled }));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext: vi.fn().mockResolvedValue({ requestId: "req" }),
  getOperationalDurationMs: () => 12,
}));
import { POST } from "../prepare-people";

const owner = { user: { id: "owner" } };
function context(body = JSON.stringify({ modalityId: "cbt", avatarId: "cbt-guide" })) {
  return {
    request: new Request("https://safespace.local/api/session/prepare-people", { method: "POST", body }),
  } as Parameters<APIRoute>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionRouteAccess.mockResolvedValue(ok(owner));
  isPeopleMemoryEnabled.mockReturnValue(true);
  prepareOwnedPeopleMemory.mockResolvedValue({ ok: true, ready: false, updated: true });
});

describe("POST /api/session/prepare-people", () => {
  it("runs one people step for the owner's perspective and asks for another while work remains", async () => {
    const response = await POST(context());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, type: "people_memory_preparing", updated: true });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(prepareOwnedPeopleMemory).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ avatarId: "cbt-guide", modalityId: "cbt" }),
      { locale: "en" },
    );
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session.people_memory_updated", outcome: "success" }),
      expect.any(Object),
    );
  });

  it("reports readiness without logging when nothing was generated", async () => {
    prepareOwnedPeopleMemory.mockResolvedValue({ ok: true, ready: true, updated: false });
    const response = await POST(context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, type: "people_memory_ready", updated: false });
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it.each([401, 403, 503])("blocks work when route access returns %s", async (status) => {
    requireSessionRouteAccess.mockResolvedValue({ ok: false, error: { code: "missing_auth", status } });
    expect((await POST(context())).status).toBe(status);
    expect(prepareOwnedPeopleMemory).not.toHaveBeenCalled();
  });

  it("is absent while the flag is off and rejects invalid avatar input", async () => {
    isPeopleMemoryEnabled.mockReturnValue(false);
    const response = await POST(context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, code: "people_memory_unavailable" });
    isPeopleMemoryEnabled.mockReturnValue(true);
    for (const body of ["{", "null", "{}", '{"modalityId":"cbt","avatarId":"psychodynamic-guide"}']) {
      expect((await POST(context(body))).status).toBe(400);
    }
    expect(prepareOwnedPeopleMemory).not.toHaveBeenCalled();
  });

  it("pauses the background loop on a provider failure with a category-only log, and answers 503 on a data failure", async () => {
    prepareOwnedPeopleMemory.mockResolvedValue({ ok: false, providerFailure: "provider_timeout" });
    const paused = await POST(context());
    expect(paused.status).toBe(200);
    expect(await paused.json()).toEqual({ ok: true, type: "people_memory_paused", updated: false });
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session.ai_provider_failed", reasonCode: "provider_timeout" }),
      expect.any(Object),
    );
    prepareOwnedPeopleMemory.mockResolvedValue({ ok: false });
    const failed = await POST(context());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ ok: false, code: "people_memory_unavailable" });
  });

  it("marks a batch accepted after splitting as partial", async () => {
    prepareOwnedPeopleMemory.mockResolvedValue({ ok: true, ready: true, updated: true, partial: true });
    expect((await POST(context())).status).toBe(200);
    expect(logOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "session.people_memory_updated", reasonCode: "people_memory_partial" }),
      expect.any(Object),
    );
  });
});
