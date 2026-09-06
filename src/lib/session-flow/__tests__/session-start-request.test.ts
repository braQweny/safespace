import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext } from "@/lib/session-data/types";

const { getOwnedPersonCard, getOwnedDifficultyCard } = vi.hoisted(() => ({
  getOwnedPersonCard: vi.fn(),
  getOwnedDifficultyCard: vi.fn(),
}));
vi.mock("@/lib/session-data/repository", () => ({ getOwnedPersonCard, getOwnedDifficultyCard }));
import {
  readSessionStartRequestBody,
  resolveAboutDifficultyForStart,
  resolveAboutPersonForStart,
} from "../session-start-request";

const PERSON_ID = "123e4567-e89b-42d3-a456-426614174000";
const DIFFICULTY_ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const context = { user: { id: "owner" } } as SessionDataContext;
const plain = { ok: true, aboutPersonId: null, aboutDifficultyId: null };

function request(body?: string, contentType = "application/json") {
  return new Request("https://safespace.local/api/session/start-next", {
    method: "POST",
    ...(body !== undefined ? { body, headers: { "Content-Type": contentType } } : {}),
  });
}

describe("readSessionStartRequestBody", () => {
  it("treats a bodiless start, an empty object and null ids as the ordinary start", async () => {
    expect(await readSessionStartRequestBody(request())).toEqual(plain);
    expect(await readSessionStartRequestBody(request("{}"))).toEqual(plain);
    expect(await readSessionStartRequestBody(request('{"aboutPersonId":null}'))).toEqual(plain);
    expect(await readSessionStartRequestBody(request('{"aboutDifficultyId":null}'))).toEqual(plain);
    expect(await readSessionStartRequestBody(request("null"))).toEqual(plain);
    expect(await readSessionStartRequestBody(request("ignored", "text/plain"))).toEqual(plain);
  });

  it("accepts only UUID ids, for a person or a difficulty, and rejects anything else", async () => {
    expect(await readSessionStartRequestBody(request(JSON.stringify({ aboutPersonId: PERSON_ID })))).toEqual({
      ...plain,
      aboutPersonId: PERSON_ID,
    });
    expect(await readSessionStartRequestBody(request(JSON.stringify({ aboutDifficultyId: DIFFICULTY_ID })))).toEqual({
      ...plain,
      aboutDifficultyId: DIFFICULTY_ID,
    });
    for (const body of [
      "{",
      "[]",
      '{"aboutPersonId":"marta"}',
      '{"aboutPersonId":5}',
      '{"aboutDifficultyId":"odmawianie"}',
    ]) {
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

describe("resolveAboutDifficultyForStart", () => {
  it("applies the same owner-and-perspective rule to a difficulty from the topic map", async () => {
    getOwnedDifficultyCard.mockResolvedValue(ok({ id: DIFFICULTY_ID, avatarId: "cbt-guide" }));
    expect(await resolveAboutDifficultyForStart(context, DIFFICULTY_ID, "cbt-guide")).toEqual({
      ok: true,
      aboutDifficultyId: DIFFICULTY_ID,
    });
    expect(await resolveAboutDifficultyForStart(context, DIFFICULTY_ID, "psychodynamic-listener")).toEqual({
      ok: false,
      code: "validation_failed",
    });
    getOwnedDifficultyCard.mockResolvedValue(ok(null));
    expect(await resolveAboutDifficultyForStart(context, DIFFICULTY_ID, "cbt-guide")).toEqual({
      ok: false,
      code: "validation_failed",
    });
    getOwnedDifficultyCard.mockResolvedValue(sessionDataError("read_failed"));
    expect(await resolveAboutDifficultyForStart(context, DIFFICULTY_ID, "cbt-guide")).toEqual({
      ok: false,
      code: "read_failed",
    });
    expect(await resolveAboutDifficultyForStart(context, null, "cbt-guide")).toEqual({
      ok: true,
      aboutDifficultyId: null,
    });
    expect(getOwnedDifficultyCard).toHaveBeenCalledTimes(4);
  });
});
