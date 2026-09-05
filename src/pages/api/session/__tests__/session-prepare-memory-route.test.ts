import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";

const { requireSessionRouteAccess, readSessionQuota, prepareOwnedAvatarMemory } = vi.hoisted(() => ({
  requireSessionRouteAccess: vi.fn(),
  readSessionQuota: vi.fn(),
  prepareOwnedAvatarMemory: vi.fn(),
}));
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-data/quota", () => ({ readSessionQuota }));
vi.mock("@/lib/session-flow/avatar-memory", () => ({ prepareOwnedAvatarMemory }));
import { POST } from "../prepare-memory";

const owner = { user: { id: "owner" } };
function context(body = JSON.stringify({ modalityId: "cbt", avatarId: "cbt-guide" })) {
  return {
    request: new Request("https://safespace.local/api/session/prepare-memory", { method: "POST", body }),
  } as Parameters<APIRoute>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionRouteAccess.mockResolvedValue(ok(owner));
  readSessionQuota.mockResolvedValue(ok({ canStartSession: true }));
  prepareOwnedAvatarMemory.mockResolvedValue({ ok: true, ready: false });
});

describe("POST /api/session/prepare-memory", () => {
  it("prepares only the authenticated owner's selected avatar and returns no private content", async () => {
    const response = await POST(context());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, type: "avatar_memory_preparing" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(prepareOwnedAvatarMemory).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ avatarId: "cbt-guide", modalityId: "cbt" }),
    );
  });

  it("returns ready without creating a session", async () => {
    prepareOwnedAvatarMemory.mockResolvedValue({ ok: true, ready: true });
    const response = await POST(context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, type: "avatar_memory_ready" });
  });

  it.each([401, 403, 503])("blocks work when route access returns %s", async (status) => {
    requireSessionRouteAccess.mockResolvedValue({ ok: false, error: { code: "missing_auth", status } });
    expect((await POST(context())).status).toBe(status);
    expect(readSessionQuota).not.toHaveBeenCalled();
    expect(prepareOwnedAvatarMemory).not.toHaveBeenCalled();
  });

  it.each(["{", "null", "{}", '{"modalityId":"cbt","avatarId":"psychodynamic-guide"}'])(
    "rejects invalid avatar input %s",
    async (body) => {
      expect((await POST(context(body))).status).toBe(400);
      expect(prepareOwnedAvatarMemory).not.toHaveBeenCalled();
    },
  );

  it("does not spend AI work when the session allowance is exhausted or unknown", async () => {
    readSessionQuota
      .mockResolvedValueOnce(ok({ canStartSession: false }))
      .mockResolvedValueOnce(sessionDataError("read_failed"));
    expect((await POST(context())).status).toBe(403);
    expect((await POST(context())).status).toBe(503);
    expect(prepareOwnedAvatarMemory).not.toHaveBeenCalled();
  });

  it("returns a retryable error without exposing the provider failure", async () => {
    prepareOwnedAvatarMemory.mockResolvedValue({ ok: false, providerFailure: "provider_timeout" });
    const response = await POST(context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, code: "summary_context_unavailable" });
  });
});
