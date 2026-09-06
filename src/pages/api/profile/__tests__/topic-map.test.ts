import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";

const { requireSessionRouteAccess, isTopicMapEnabled, setOwnedTopicMapEnabled } = vi.hoisted(() => ({
  requireSessionRouteAccess: vi.fn(),
  isTopicMapEnabled: vi.fn(() => true),
  setOwnedTopicMapEnabled: vi.fn(),
}));
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-flow/topic-map-mode", () => ({ isTopicMapEnabled }));
vi.mock("@/lib/session-data/repository", () => ({ setOwnedTopicMapEnabled }));
import { POST } from "../topic-map";

const owner = { user: { id: "owner" } };

function context(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return {
    request: new Request("https://safespace.local/api/profile/topic-map", { method: "POST", body }),
    cookies: {},
    locals: { user: { id: "owner" } },
    redirect: (target: string, status?: number) =>
      new Response(null, { status: status ?? 302, headers: { Location: target } }),
  } as unknown as Parameters<APIRoute>[0];
}

const location = (response: Response) => response.headers.get("Location");

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionRouteAccess.mockResolvedValue(ok(owner));
  isTopicMapEnabled.mockReturnValue(true);
  setOwnedTopicMapEnabled.mockResolvedValue(ok(true));
});

describe("POST /api/profile/topic-map", () => {
  it("saves the choice through the RPC and returns to the account page with a status", async () => {
    const response = await POST(context({ enabled: "0" }));
    expect(response.status).toBe(303);
    expect(location(response)).toBe("/account/security?topics=saved#topic-map");
    expect(setOwnedTopicMapEnabled).toHaveBeenCalledWith(owner, false);
    await POST(context({ enabled: "1" }));
    expect(setOwnedTopicMapEnabled).toHaveBeenLastCalledWith(owner, true);
  });

  it("never fails open: a lost write comes back as a visible status", async () => {
    setOwnedTopicMapEnabled.mockResolvedValue(sessionDataError("write_failed"));
    expect(location(await POST(context({ enabled: "0" })))).toBe("/account/security?topics=save_failed#topic-map");
  });

  it("ignores an unknown value silently and requires a signed-in, active account", async () => {
    expect(location(await POST(context({ enabled: "maybe" })))).toBe("/account/security");
    expect(setOwnedTopicMapEnabled).not.toHaveBeenCalled();
    requireSessionRouteAccess.mockResolvedValue({
      ok: false,
      error: { code: "missing_auth", status: 401, source: "session_context" },
    });
    expect(location(await POST(context({ enabled: "1" })))).toBe("/auth/signin");
    requireSessionRouteAccess.mockResolvedValue({
      ok: false,
      error: { code: "account_blocked", status: 403, source: "account_access" },
    });
    expect(location(await POST(context({ enabled: "1" })))).toBe("/account/blocked");
  });

  it("blocks only switching on while the flag is off; switching off keeps working", async () => {
    isTopicMapEnabled.mockReturnValue(false);
    expect(location(await POST(context({ enabled: "1" })))).toBe("/account/security?topics=unavailable#topic-map");
    expect(setOwnedTopicMapEnabled).not.toHaveBeenCalled();
    expect(location(await POST(context({ enabled: "0" })))).toBe("/account/security?topics=saved#topic-map");
    expect(setOwnedTopicMapEnabled).toHaveBeenCalledWith(owner, false);
  });
});
