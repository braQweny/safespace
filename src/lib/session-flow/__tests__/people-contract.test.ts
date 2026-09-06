import { describe, expect, it } from "vitest";
import {
  getPeopleFailureStatus,
  isPeopleFailure,
  isPeopleListSuccess,
  isPeopleSettingsStatusCode,
  isPersonFactDeleted,
  isPersonForgetSuccess,
  isPersonUpdateSuccess,
  parseFactUpdateRequest,
  parsePersonIdParam,
  parsePersonUpdateRequest,
  PEOPLE_LIMITS,
  peopleFailure,
} from "../people-contract";

describe("parsePersonUpdateRequest", () => {
  it("trims, keeps an empty relation and note as null / empty, and requires a name", () => {
    expect(parsePersonUpdateRequest({ displayName: "  Marta ", relation: "  ", userNote: " Uwaga " })).toEqual({
      displayName: "Marta",
      relation: null,
      userNote: "Uwaga",
    });
    expect(parsePersonUpdateRequest({ displayName: "Marta", relation: null, userNote: null })).toEqual({
      displayName: "Marta",
      relation: null,
      userNote: "",
    });
    expect(parsePersonUpdateRequest({ displayName: "", relation: "x", userNote: "" })).toBeNull();
    expect(parsePersonUpdateRequest({ displayName: "Marta", relation: 5, userNote: "" })).toBeNull();
    expect(parsePersonUpdateRequest(null)).toBeNull();
    expect(parsePersonUpdateRequest("Marta")).toBeNull();
  });

  it("measures limits in Unicode characters", () => {
    expect(
      parsePersonUpdateRequest({ displayName: "🙂".repeat(PEOPLE_LIMITS.displayName), relation: null, userNote: "" }),
    ).not.toBeNull();
    expect(
      parsePersonUpdateRequest({
        displayName: "🙂".repeat(PEOPLE_LIMITS.displayName + 1),
        relation: null,
        userNote: "",
      }),
    ).toBeNull();
    expect(
      parsePersonUpdateRequest({ displayName: "M", relation: "r".repeat(PEOPLE_LIMITS.relation + 1), userNote: "" }),
    ).toBeNull();
    expect(
      parsePersonUpdateRequest({ displayName: "M", relation: null, userNote: "n".repeat(PEOPLE_LIMITS.userNote + 1) }),
    ).toBeNull();
    expect(parseFactUpdateRequest({ text: "🙂".repeat(PEOPLE_LIMITS.fact) })).toEqual({
      text: "🙂".repeat(PEOPLE_LIMITS.fact),
    });
    expect(parseFactUpdateRequest({ text: "🙂".repeat(PEOPLE_LIMITS.fact + 1) })).toBeNull();
    expect(parseFactUpdateRequest({ text: "   " })).toBeNull();
  });
});

describe("people contract guards", () => {
  const nonResponses = [null, undefined, 5, "x", [], { ok: true }, { ok: false, code: "read_failed" }];

  it("narrows only the exact response shapes", () => {
    expect(isPeopleListSuccess({ ok: true, type: "people_list", cards: [] })).toBe(true);
    expect(isPersonUpdateSuccess({ ok: true, type: "person_updated", card: { id: "p" } })).toBe(true);
    expect(isPersonForgetSuccess({ ok: true, type: "person_forgotten", personId: "p" })).toBe(true);
    expect(isPersonFactDeleted({ ok: true, type: "person_fact_deleted", personId: "p", card: null })).toBe(true);
    expect(isPeopleFailure(peopleFailure("person_not_found"))).toBe(true);
    for (const value of nonResponses) {
      expect(isPeopleListSuccess(value)).toBe(false);
      expect(isPersonUpdateSuccess(value)).toBe(false);
      expect(isPersonForgetSuccess(value)).toBe(false);
      expect(isPersonFactDeleted(value)).toBe(false);
      expect(isPeopleFailure(value)).toBe(false);
    }
  });

  it("maps failure codes to stable statuses and accepts only UUID ids", () => {
    expect(getPeopleFailureStatus("missing_auth")).toBe(401);
    expect(getPeopleFailureStatus("account_blocked")).toBe(403);
    expect(getPeopleFailureStatus("validation_failed")).toBe(400);
    expect(getPeopleFailureStatus("person_not_found")).toBe(404);
    expect(getPeopleFailureStatus("people_memory_unavailable")).toBe(404);
    expect(getPeopleFailureStatus("update_failed")).toBe(500);
    expect(getPeopleFailureStatus("session_data_unavailable")).toBe(503);
    expect(parsePersonIdParam("5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a")).toBe("5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a");
    expect(parsePersonIdParam("marta")).toBeNull();
    expect(isPeopleSettingsStatusCode("saved")).toBe(true);
    expect(isPeopleSettingsStatusCode("hacked")).toBe(false);
  });
});
