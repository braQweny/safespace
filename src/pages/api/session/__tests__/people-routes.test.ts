import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";

const {
  requireSessionRouteAccess,
  isPeopleMemoryEnabled,
  readPersonCards,
  updatePersonCard,
  updatePersonFact,
  deletePersonFact,
  forgetPersonCard,
  disableAndDeleteOwnedPeopleMemory,
} = vi.hoisted(() => ({
  requireSessionRouteAccess: vi.fn(),
  isPeopleMemoryEnabled: vi.fn(() => true),
  readPersonCards: vi.fn(),
  updatePersonCard: vi.fn(),
  updatePersonFact: vi.fn(),
  deletePersonFact: vi.fn(),
  forgetPersonCard: vi.fn(),
  disableAndDeleteOwnedPeopleMemory: vi.fn(),
}));
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-flow/people-memory-mode", () => ({ isPeopleMemoryEnabled }));
vi.mock("@/lib/session-flow/people-cards", () => ({
  readPersonCards,
  updatePersonCard,
  updatePersonFact,
  deletePersonFact,
  forgetPersonCard,
}));
vi.mock("@/lib/session-data/repository", () => ({ disableAndDeleteOwnedPeopleMemory }));

const [
  { GET },
  { PATCH: PATCH_PERSON },
  { POST: FORGET },
  { PATCH: PATCH_FACT, DELETE: DELETE_FACT },
  { POST: DELETE_ALL },
] = await Promise.all([
  import("@/pages/api/session/people/index"),
  import("@/pages/api/session/people/[personId]"),
  import("@/pages/api/session/people/[personId]/forget"),
  import("@/pages/api/session/people/[personId]/facts/[factId]"),
  import("@/pages/api/session/people/delete-all"),
]);

const PERSON_ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const FACT_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const owner = { user: { id: "owner" } };
const card = { id: PERSON_ID, name: "Marta", avatarId: "cbt-guide", facts: [] };

function context(options: { url?: string; method?: string; body?: BodyInit; params?: Record<string, string> } = {}) {
  const url = options.url ?? `https://safespace.local/api/session/people/${PERSON_ID}`;
  return {
    request: new Request(url, {
      method: options.method ?? "GET",
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(typeof options.body === "string" ? { headers: { "Content-Type": "application/json" } } : {}),
    }),
    cookies: {},
    locals: { user: { id: "owner" } },
    params: { personId: PERSON_ID, factId: FACT_ID, ...options.params },
    url: new URL(url),
    redirect: (target: string, status?: number) =>
      new Response(null, { status: status ?? 302, headers: { Location: target } }),
  } as unknown as Parameters<APIRoute>[0];
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireSessionRouteAccess.mockResolvedValue(ok(owner));
  isPeopleMemoryEnabled.mockReturnValue(true);
  readPersonCards.mockResolvedValue({ ok: true, type: "people_list", cards: [card] });
  updatePersonCard.mockResolvedValue({ ok: true, type: "person_updated", card });
  updatePersonFact.mockResolvedValue({ ok: true, type: "person_updated", card });
  deletePersonFact.mockResolvedValue({ ok: true, type: "person_fact_deleted", personId: PERSON_ID, card });
  forgetPersonCard.mockResolvedValue({ ok: true, type: "person_forgotten", personId: PERSON_ID });
  disableAndDeleteOwnedPeopleMemory.mockResolvedValue(ok(true));
});

describe("GET /api/session/people", () => {
  it("lists the owner's cards for one perspective without caching", async () => {
    const response = await GET(context({ url: "https://safespace.local/api/session/people?avatar=cbt-guide" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await readJson(response)).toEqual({ ok: true, type: "people_list", cards: [card] });
    expect(readPersonCards).toHaveBeenCalledWith(owner, "cbt-guide");
  });

  it("is absent while the flag is off and rejects an unknown perspective", async () => {
    isPeopleMemoryEnabled.mockReturnValue(false);
    expect((await GET(context({ url: "https://safespace.local/api/session/people?avatar=cbt-guide" }))).status).toBe(
      404,
    );
    isPeopleMemoryEnabled.mockReturnValue(true);
    const response = await GET(context({ url: "https://safespace.local/api/session/people?avatar=nope" }));
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ ok: false, type: "people_error", code: "validation_failed" });
  });
});

describe("PATCH /api/session/people/[personId]", () => {
  it("validates the body against the limits and updates the card", async () => {
    const invalid = await PATCH_PERSON(context({ method: "PATCH", body: JSON.stringify({ displayName: "" }) }));
    expect(invalid.status).toBe(400);
    expect(await readJson(invalid)).toMatchObject({
      code: "validation_failed",
      limits: { displayName: 60, fact: 200 },
    });
    const response = await PATCH_PERSON(
      context({ method: "PATCH", body: JSON.stringify({ displayName: "Marta", relation: null, userNote: "n" }) }),
    );
    expect(response.status).toBe(200);
    expect(updatePersonCard).toHaveBeenCalledWith(owner, PERSON_ID, {
      displayName: "Marta",
      relation: null,
      userNote: "n",
    });
  });

  it.each([
    ["missing_auth", 401],
    ["account_blocked", 403],
    ["account_access_unavailable", 503],
  ] as const)("passes the %s access failure through as %s", async (code, status) => {
    requireSessionRouteAccess.mockResolvedValue({ ok: false, error: { code, status, source: "account_access" } });
    const response = await PATCH_PERSON(context({ method: "PATCH", body: "{}" }));
    expect(response.status).toBe(status);
    expect(await readJson(response)).toEqual({ ok: false, type: "people_error", code });
    expect(updatePersonCard).not.toHaveBeenCalled();
  });

  it("answers 404 for a non-UUID id, a missing card and a switched-off flag", async () => {
    expect((await PATCH_PERSON(context({ method: "PATCH", body: "{}", params: { personId: "marta" } }))).status).toBe(
      404,
    );
    updatePersonCard.mockResolvedValue({ ok: false, type: "people_error", code: "person_not_found" });
    expect(
      (
        await PATCH_PERSON(
          context({ method: "PATCH", body: JSON.stringify({ displayName: "M", relation: null, userNote: "" }) }),
        )
      ).status,
    ).toBe(404);
    isPeopleMemoryEnabled.mockReturnValue(false);
    expect((await PATCH_PERSON(context({ method: "PATCH", body: "{}" }))).status).toBe(404);
  });
});

describe("POST /api/session/people/[personId]/forget", () => {
  it("forgets regardless of the flag and reports a missing card as 404", async () => {
    isPeopleMemoryEnabled.mockReturnValue(false);
    const response = await FORGET(context({ method: "POST" }));
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, type: "person_forgotten", personId: PERSON_ID });
    forgetPersonCard.mockResolvedValue({ ok: false, type: "people_error", code: "person_not_found" });
    expect((await FORGET(context({ method: "POST" }))).status).toBe(404);
  });
});

describe("/api/session/people/[personId]/facts/[factId]", () => {
  it("corrects and removes an entry, refusing an entry that belongs to another card", async () => {
    const patched = await PATCH_FACT(context({ method: "PATCH", body: JSON.stringify({ text: "Doprecyzowane." }) }));
    expect(patched.status).toBe(200);
    expect(updatePersonFact).toHaveBeenCalledWith(owner, FACT_ID, "Doprecyzowane.");
    expect((await PATCH_FACT(context({ method: "PATCH", body: JSON.stringify({ text: "" }) }))).status).toBe(400);
    const deleted = await DELETE_FACT(context({ method: "DELETE" }));
    expect(deleted.status).toBe(200);
    expect(await readJson(deleted)).toMatchObject({ type: "person_fact_deleted", personId: PERSON_ID });
    deletePersonFact.mockResolvedValue({ ok: true, type: "person_fact_deleted", personId: "other", card: null });
    expect((await DELETE_FACT(context({ method: "DELETE" }))).status).toBe(404);
    expect((await DELETE_FACT(context({ method: "DELETE", params: { factId: "x" } }))).status).toBe(404);
  });
});

describe("POST /api/session/people/delete-all", () => {
  function form(fields: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return body;
  }

  it("requires the confirmation box, then disables and deletes everything", async () => {
    const unconfirmed = await DELETE_ALL(context({ method: "POST", body: form({}) }));
    expect(unconfirmed.headers.get("Location")).toBe(
      "/account/security?people=delete_confirmation_required#people-memory",
    );
    expect(disableAndDeleteOwnedPeopleMemory).not.toHaveBeenCalled();
    const confirmed = await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }));
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("Location")).toBe("/account/security?people=deleted#people-memory");
    disableAndDeleteOwnedPeopleMemory.mockResolvedValue(sessionDataError("write_failed"));
    expect((await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }))).headers.get("Location")).toBe(
      "/account/security?people=delete_failed#people-memory",
    );
  });

  it("sends a signed-out owner to sign-in and a blocked account to its page", async () => {
    requireSessionRouteAccess.mockResolvedValue({
      ok: false,
      error: { code: "missing_auth", status: 401, source: "session_context" },
    });
    expect((await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }))).headers.get("Location")).toBe(
      "/auth/signin",
    );
    requireSessionRouteAccess.mockResolvedValue({
      ok: false,
      error: { code: "account_blocked", status: 403, source: "account_access" },
    });
    expect((await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }))).headers.get("Location")).toBe(
      "/account/blocked",
    );
    expect(disableAndDeleteOwnedPeopleMemory).not.toHaveBeenCalled();
  });
});
