import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";

const { requireSessionRouteAccess, disableAndDeleteOwnedPeopleMemory, disableAndDeleteOwnedTopicMap } = vi.hoisted(
  () => ({
    requireSessionRouteAccess: vi.fn(),
    disableAndDeleteOwnedPeopleMemory: vi.fn(),
    disableAndDeleteOwnedTopicMap: vi.fn(),
  }),
);
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-data/repository", () => ({
  disableAndDeleteOwnedPeopleMemory,
  disableAndDeleteOwnedTopicMap,
}));
import { POST } from "../delete-all";

const owner = { user: { id: "owner" } };

function context(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return {
    request: new Request("https://safespace.local/api/session/memory/delete-all", { method: "POST", body }),
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
  disableAndDeleteOwnedPeopleMemory.mockResolvedValue(ok(true));
  disableAndDeleteOwnedTopicMap.mockResolvedValue(ok(true));
});

describe("POST /api/session/memory/delete-all", () => {
  it("deletes exactly the chosen scope and returns to the memory card with a matching status", async () => {
    const people = await POST(context({ scope: "people", confirm: "1" }));
    expect(people.status).toBe(303);
    expect(location(people)).toBe("/account/security?memory=deleted_people#memory");
    expect(disableAndDeleteOwnedPeopleMemory).toHaveBeenCalledWith(owner);
    expect(disableAndDeleteOwnedTopicMap).not.toHaveBeenCalled();

    vi.clearAllMocks();
    expect(location(await POST(context({ scope: "topics", confirm: "1" })))).toBe(
      "/account/security?memory=deleted_topics#memory",
    );
    expect(disableAndDeleteOwnedPeopleMemory).not.toHaveBeenCalled();
    expect(disableAndDeleteOwnedTopicMap).toHaveBeenCalledWith(owner);

    vi.clearAllMocks();
    expect(location(await POST(context({ scope: "all", confirm: "1" })))).toBe(
      "/account/security?memory=deleted_all#memory",
    );
    expect(disableAndDeleteOwnedPeopleMemory).toHaveBeenCalledWith(owner);
    expect(disableAndDeleteOwnedTopicMap).toHaveBeenCalledWith(owner);
  });

  it("refuses an unknown scope and a missing confirmation before touching anything", async () => {
    expect(location(await POST(context({ scope: "everything", confirm: "1" })))).toBe(
      "/account/security?memory=invalid_scope#memory",
    );
    expect(location(await POST(context({ scope: "all" })))).toBe(
      "/account/security?memory=delete_confirmation_required#memory",
    );
    expect(disableAndDeleteOwnedPeopleMemory).not.toHaveBeenCalled();
    expect(disableAndDeleteOwnedTopicMap).not.toHaveBeenCalled();
  });

  it("reports a failed step as a visible status and stops there", async () => {
    disableAndDeleteOwnedPeopleMemory.mockResolvedValueOnce(sessionDataError("session_data_unavailable"));
    expect(location(await POST(context({ scope: "all", confirm: "1" })))).toBe(
      "/account/security?memory=delete_failed#memory",
    );
    expect(disableAndDeleteOwnedTopicMap).not.toHaveBeenCalled();
    disableAndDeleteOwnedTopicMap.mockResolvedValueOnce(ok(false));
    expect(location(await POST(context({ scope: "topics", confirm: "1" })))).toBe(
      "/account/security?memory=delete_failed#memory",
    );
  });

  it("requires a signed-in, active account", async () => {
    requireSessionRouteAccess.mockResolvedValueOnce({
      ok: false,
      error: { code: "missing_auth", source: "session_context" },
    });
    expect(location(await POST(context({ scope: "all", confirm: "1" })))).toBe("/auth/signin");
    requireSessionRouteAccess.mockResolvedValueOnce({
      ok: false,
      error: { code: "account_blocked", source: "account_access" },
    });
    expect(location(await POST(context({ scope: "all", confirm: "1" })))).toBe("/account/blocked");
    expect(disableAndDeleteOwnedPeopleMemory).not.toHaveBeenCalled();
  });
});
