import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext } from "@/lib/session-data/types";

const { getOwnedPersonCard } = vi.hoisted(() => ({ getOwnedPersonCard: vi.fn() }));
vi.mock("@/lib/session-data/repository", () => ({ getOwnedPersonCard }));
import { readSessionStartRequestBody, resolveAboutPersonForStart } from "../session-start-request";

const PERSON_ID = "123e4567-e89b-42d3-a456-426614174000";
const context = { user: { id: "owner" } } as SessionDataContext;

function request(body?: string, contentType = "application/json") {
  return new Request("https://safespace.local/api/session/start-next", {
    method: "POST",
    ...(body !== undefined ? { body, headers: { "Content-Type": contentType } } : {}),
  });
}

describe("readSessionStartRequestBody", () => {
  it("treats a bodiless start, an empty object and a null person as the ordinary start", async () => {
    expect(await readSessionStartRequestBody(request())).toEqual({ ok: true, aboutPersonId: null });
    expect(await readSessionStartRequestBody(request("{}"))).toEqual({ ok: true, aboutPersonId: null });
    expect(await readSessionStartRequestBody(request('{"aboutPersonId":null}'))).toEqual({
      ok: true,
      aboutPersonId: null,
    });
    expect(await readSessionStartRequestBody(request("null"))).toEqual({ ok: true, aboutPersonId: null });
    expect(await readSessionStartRequestBody(request("ignored", "text/plain"))).toEqual({
      ok: true,
      aboutPersonId: null,
    });
  });

  it("accepts only a UUID person id and rejects anything else", async () => {
    expect(await readSessionStartRequestBody(request(JSON.stringify({ aboutPersonId: PERSON_ID })))).toEqual({
      ok: true,
      aboutPersonId: PERSON_ID,
    });
    for (const body of ["{", "[]", '{"aboutPersonId":"marta"}', '{"aboutPersonId":5}']) {
      expect(await readSessionStartRequestBody(request(body))).toEqual({ ok: false });
    }
  });
});

describe("resolveAboutPersonForStart", () => {
  it("requires the card to belong to the owner and to the starting perspective", async () => {
    getOwnedPersonCard.mockResolvedValue(ok({ id: PERSON_ID, avatarId: "cbt-guide" }));
    expect(await resolveAboutPersonForStart(context, PERSON_ID, "cbt-guide")).toEqual({
      ok: true,
      aboutPersonId: PERSON_ID,
    });
    expect(await resolveAboutPersonForStart(context, PERSON_ID, "psychodynamic-listener")).toEqual({
      ok: false,
      code: "validation_failed",
    });
    getOwnedPersonCard.mockResolvedValue(ok(null));
    expect(await resolveAboutPersonForStart(context, PERSON_ID, "cbt-guide")).toEqual({
      ok: false,
      code: "validation_failed",
    });
    getOwnedPersonCard.mockResolvedValue(sessionDataError("read_failed"));
    expect(await resolveAboutPersonForStart(context, PERSON_ID, "cbt-guide")).toEqual({
      ok: false,
      code: "read_failed",
    });
    expect(await resolveAboutPersonForStart(context, null, "cbt-guide")).toEqual({ ok: true, aboutPersonId: null });
  });
});
