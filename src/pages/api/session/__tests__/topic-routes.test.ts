import type { APIRoute } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";

const {
  requireSessionRouteAccess,
  isTopicMapEnabled,
  readDifficultyCards,
  updateDifficultyCard,
  deleteDifficultyCard,
  decideDifficultyPerson,
  updateDifficultyEntry,
  deleteDifficultyEntry,
  mergeDifficultyCards,
  disableAndDeleteOwnedTopicMap,
} = vi.hoisted(() => ({
  requireSessionRouteAccess: vi.fn(),
  isTopicMapEnabled: vi.fn(() => true),
  readDifficultyCards: vi.fn(),
  updateDifficultyCard: vi.fn(),
  deleteDifficultyCard: vi.fn(),
  decideDifficultyPerson: vi.fn(),
  updateDifficultyEntry: vi.fn(),
  deleteDifficultyEntry: vi.fn(),
  mergeDifficultyCards: vi.fn(),
  disableAndDeleteOwnedTopicMap: vi.fn(),
}));
vi.mock("@/lib/session-flow/route-access", () => ({ requireSessionRouteAccess }));
vi.mock("@/lib/session-flow/topic-map-mode", () => ({ isTopicMapEnabled }));
vi.mock("@/lib/session-flow/topic-cards", () => ({
  readDifficultyCards,
  updateDifficultyCard,
  deleteDifficultyCard,
  decideDifficultyPerson,
  updateDifficultyEntry,
  deleteDifficultyEntry,
  mergeDifficultyCards,
}));
vi.mock("@/lib/session-data/repository", () => ({ disableAndDeleteOwnedTopicMap }));

const [
  { GET },
  { PATCH: PATCH_DIFFICULTY, DELETE: DELETE_DIFFICULTY },
  { PATCH: PATCH_ENTRY, DELETE: DELETE_ENTRY },
  { POST: DECIDE },
  { POST: MERGE },
  { POST: DELETE_ALL },
] = await Promise.all([
  import("@/pages/api/session/topics/index"),
  import("@/pages/api/session/topics/[difficultyId]"),
  import("@/pages/api/session/topics/[difficultyId]/entries/[entryId]"),
  import("@/pages/api/session/topics/[difficultyId]/persons/[personId]"),
  import("@/pages/api/session/topics/[difficultyId]/merge"),
  import("@/pages/api/session/topics/delete-all"),
]);

const DIFFICULTY_ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const ENTRY_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
const PERSON_ID = "7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const TARGET_ID = "8b2c3d4e-5f6a-4b7c-9d0e-1f2a3b4c5d6e";
const owner = { user: { id: "owner" } };
const card = { id: DIFFICULTY_ID, label: "Odmawianie", avatarId: "cbt-guide", entries: [] };

function context(options: { url?: string; method?: string; body?: BodyInit; params?: Record<string, string> } = {}) {
  const url = options.url ?? `https://safespace.local/api/session/topics/${DIFFICULTY_ID}`;
  return {
    request: new Request(url, {
      method: options.method ?? "GET",
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(typeof options.body === "string" ? { headers: { "Content-Type": "application/json" } } : {}),
    }),
    cookies: {},
    locals: { user: { id: "owner" } },
    params: { difficultyId: DIFFICULTY_ID, entryId: ENTRY_ID, personId: PERSON_ID, ...options.params },
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
  isTopicMapEnabled.mockReturnValue(true);
  readDifficultyCards.mockResolvedValue({ ok: true, type: "topic_list", cards: [card] });
  updateDifficultyCard.mockResolvedValue({ ok: true, type: "difficulty_updated", card });
  deleteDifficultyCard.mockResolvedValue({ ok: true, type: "difficulty_deleted", difficultyId: DIFFICULTY_ID });
  decideDifficultyPerson.mockResolvedValue({ ok: true, type: "difficulty_updated", card });
  updateDifficultyEntry.mockResolvedValue({ ok: true, type: "difficulty_updated", card });
  deleteDifficultyEntry.mockResolvedValue({
    ok: true,
    type: "difficulty_entry_deleted",
    difficultyId: DIFFICULTY_ID,
    card,
  });
  mergeDifficultyCards.mockResolvedValue({
    ok: true,
    type: "difficulty_merged",
    sourceId: DIFFICULTY_ID,
    card: { ...card, id: TARGET_ID },
  });
  disableAndDeleteOwnedTopicMap.mockResolvedValue(ok(true));
});

describe("GET /api/session/topics", () => {
  it("lists the owner's difficulties for one perspective without caching", async () => {
    const response = await GET(context({ url: "https://safespace.local/api/session/topics?avatar=cbt-guide" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await readJson(response)).toEqual({ ok: true, type: "topic_list", cards: [card] });
    expect(readDifficultyCards).toHaveBeenCalledWith(owner, "cbt-guide");
  });

  it("is absent while the flag is off and rejects an unknown perspective", async () => {
    isTopicMapEnabled.mockReturnValue(false);
    expect((await GET(context({ url: "https://safespace.local/api/session/topics?avatar=cbt-guide" }))).status).toBe(
      404,
    );
    isTopicMapEnabled.mockReturnValue(true);
    const response = await GET(context({ url: "https://safespace.local/api/session/topics?avatar=nope" }));
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ ok: false, type: "topic_error", code: "validation_failed" });
  });
});

describe("PATCH / DELETE /api/session/topics/[difficultyId]", () => {
  it("validates the body against the limits and updates the card", async () => {
    const invalid = await PATCH_DIFFICULTY(context({ method: "PATCH", body: JSON.stringify({ label: "" }) }));
    expect(invalid.status).toBe(400);
    expect(await readJson(invalid)).toMatchObject({ code: "validation_failed", limits: { label: 60, entry: 200 } });
    const response = await PATCH_DIFFICULTY(
      context({ method: "PATCH", body: JSON.stringify({ label: "Odmawianie", userNote: "n", archived: true }) }),
    );
    expect(response.status).toBe(200);
    expect(updateDifficultyCard).toHaveBeenCalledWith(owner, DIFFICULTY_ID, {
      label: "Odmawianie",
      userNote: "n",
      archived: true,
    });
  });

  it("answers 409 for a label another difficulty already carries", async () => {
    updateDifficultyCard.mockResolvedValue({ ok: false, type: "topic_error", code: "duplicate_difficulty_label" });
    const response = await PATCH_DIFFICULTY(
      context({ method: "PATCH", body: JSON.stringify({ label: "Odmawianie", userNote: "" }) }),
    );
    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({ ok: false, type: "topic_error", code: "duplicate_difficulty_label" });
  });

  it.each([
    ["missing_auth", 401],
    ["account_blocked", 403],
    ["account_access_unavailable", 503],
  ] as const)("passes the %s access failure through as %s", async (code, status) => {
    requireSessionRouteAccess.mockResolvedValue({ ok: false, error: { code, status, source: "account_access" } });
    const response = await PATCH_DIFFICULTY(context({ method: "PATCH", body: "{}" }));
    expect(response.status).toBe(status);
    expect(await readJson(response)).toEqual({ ok: false, type: "topic_error", code });
    expect(updateDifficultyCard).not.toHaveBeenCalled();
  });

  it("answers 404 for a non-UUID id, a missing card and a switched-off flag", async () => {
    expect(
      (await PATCH_DIFFICULTY(context({ method: "PATCH", body: "{}", params: { difficultyId: "odmawianie" } }))).status,
    ).toBe(404);
    updateDifficultyCard.mockResolvedValue({ ok: false, type: "topic_error", code: "difficulty_not_found" });
    expect(
      (await PATCH_DIFFICULTY(context({ method: "PATCH", body: JSON.stringify({ label: "O", userNote: "" }) }))).status,
    ).toBe(404);
    isTopicMapEnabled.mockReturnValue(false);
    expect((await PATCH_DIFFICULTY(context({ method: "PATCH", body: "{}" }))).status).toBe(404);
  });

  it("deletes regardless of the flag and reports a missing card as 404", async () => {
    isTopicMapEnabled.mockReturnValue(false);
    const response = await DELETE_DIFFICULTY(context({ method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true, type: "difficulty_deleted", difficultyId: DIFFICULTY_ID });
    deleteDifficultyCard.mockResolvedValue({ ok: false, type: "topic_error", code: "difficulty_not_found" });
    expect((await DELETE_DIFFICULTY(context({ method: "DELETE" }))).status).toBe(404);
  });
});

describe("/api/session/topics/[difficultyId]/entries/[entryId]", () => {
  it("corrects and removes an entry regardless of the flag, refusing an entry of another difficulty", async () => {
    isTopicMapEnabled.mockReturnValue(false);
    const patched = await PATCH_ENTRY(context({ method: "PATCH", body: JSON.stringify({ text: "Doprecyzowane." }) }));
    expect(patched.status).toBe(200);
    expect(updateDifficultyEntry).toHaveBeenCalledWith(owner, ENTRY_ID, "Doprecyzowane.");
    expect((await PATCH_ENTRY(context({ method: "PATCH", body: JSON.stringify({ text: "" }) }))).status).toBe(400);
    updateDifficultyEntry.mockResolvedValue({ ok: true, type: "difficulty_updated", card: { ...card, id: "other" } });
    expect((await PATCH_ENTRY(context({ method: "PATCH", body: JSON.stringify({ text: "x" }) }))).status).toBe(404);
    const deleted = await DELETE_ENTRY(context({ method: "DELETE" }));
    expect(deleted.status).toBe(200);
    expect(await readJson(deleted)).toMatchObject({ type: "difficulty_entry_deleted", difficultyId: DIFFICULTY_ID });
    deleteDifficultyEntry.mockResolvedValue({
      ok: true,
      type: "difficulty_entry_deleted",
      difficultyId: "other",
      card: null,
    });
    expect((await DELETE_ENTRY(context({ method: "DELETE" }))).status).toBe(404);
    expect((await DELETE_ENTRY(context({ method: "DELETE", params: { entryId: "x" } }))).status).toBe(404);
  });
});

describe("POST /api/session/topics/[difficultyId]/persons/[personId]", () => {
  it("accepts only confirmed or rejected, behind the flag, and passes the decision through", async () => {
    const response = await DECIDE(context({ method: "POST", body: JSON.stringify({ state: "rejected" }) }));
    expect(response.status).toBe(200);
    expect(decideDifficultyPerson).toHaveBeenCalledWith(owner, DIFFICULTY_ID, PERSON_ID, "rejected");
    expect((await DECIDE(context({ method: "POST", body: JSON.stringify({ state: "suggested" }) }))).status).toBe(400);
    expect(
      (
        await DECIDE(
          context({ method: "POST", body: JSON.stringify({ state: "confirmed" }), params: { personId: "m" } }),
        )
      ).status,
    ).toBe(404);
    decideDifficultyPerson.mockResolvedValue({ ok: false, type: "topic_error", code: "person_not_found" });
    expect((await DECIDE(context({ method: "POST", body: JSON.stringify({ state: "confirmed" }) }))).status).toBe(404);
    isTopicMapEnabled.mockReturnValue(false);
    expect((await DECIDE(context({ method: "POST", body: JSON.stringify({ state: "confirmed" }) }))).status).toBe(404);
  });
});

describe("POST /api/session/topics/[difficultyId]/merge", () => {
  it("merges the addressed difficulty into the target from the body, behind the flag", async () => {
    const response = await MERGE(context({ method: "POST", body: JSON.stringify({ targetId: TARGET_ID }) }));
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ type: "difficulty_merged", sourceId: DIFFICULTY_ID });
    expect(mergeDifficultyCards).toHaveBeenCalledWith(owner, DIFFICULTY_ID, TARGET_ID);
    expect((await MERGE(context({ method: "POST", body: JSON.stringify({ targetId: "x" }) }))).status).toBe(400);
    expect((await MERGE(context({ method: "POST", body: "nope" }))).status).toBe(400);
    isTopicMapEnabled.mockReturnValue(false);
    expect((await MERGE(context({ method: "POST", body: JSON.stringify({ targetId: TARGET_ID }) }))).status).toBe(404);
  });
});

describe("POST /api/session/topics/delete-all", () => {
  function form(fields: Record<string, string>) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return body;
  }

  it("requires the confirmation box, then disables and deletes the whole map", async () => {
    const unconfirmed = await DELETE_ALL(context({ method: "POST", body: form({}) }));
    expect(unconfirmed.headers.get("Location")).toBe("/account/security?topics=delete_confirmation_required#topic-map");
    expect(disableAndDeleteOwnedTopicMap).not.toHaveBeenCalled();
    const confirmed = await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }));
    expect(confirmed.status).toBe(303);
    expect(confirmed.headers.get("Location")).toBe("/account/security?topics=deleted#topic-map");
    disableAndDeleteOwnedTopicMap.mockResolvedValue(sessionDataError("write_failed"));
    expect((await DELETE_ALL(context({ method: "POST", body: form({ confirm: "1" }) }))).headers.get("Location")).toBe(
      "/account/security?topics=delete_failed#topic-map",
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
    expect(disableAndDeleteOwnedTopicMap).not.toHaveBeenCalled();
  });
});
