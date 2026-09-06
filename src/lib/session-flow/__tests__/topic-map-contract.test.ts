import { describe, expect, it } from "vitest";
import {
  getTopicFailureStatus,
  isDifficultyDeleted,
  isDifficultyEntryDeleted,
  isDifficultyMerged,
  isDifficultyUpdateSuccess,
  isTopicFailure,
  isTopicListSuccess,
  isTopicSettingsStatusCode,
  parseDifficultyEntryUpdateRequest,
  parseDifficultyIdParam,
  parseDifficultyMergeRequest,
  parseDifficultyPersonDecisionRequest,
  parseDifficultyUpdateRequest,
  TOPIC_LIMITS,
  topicFailure,
} from "../topic-map-contract";

const ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";

describe("parseDifficultyUpdateRequest", () => {
  it("trims, keeps an empty note as empty, defaults archived to false and requires a label", () => {
    expect(parseDifficultyUpdateRequest({ label: "  Odmawianie ", userNote: " Uwaga ", archived: true })).toEqual({
      label: "Odmawianie",
      userNote: "Uwaga",
      archived: true,
    });
    expect(parseDifficultyUpdateRequest({ label: "Odmawianie", userNote: null })).toEqual({
      label: "Odmawianie",
      userNote: "",
      archived: false,
    });
    expect(parseDifficultyUpdateRequest({ label: "", userNote: "x" })).toBeNull();
    expect(parseDifficultyUpdateRequest({ label: "Odmawianie", userNote: 5 })).toBeNull();
    expect(parseDifficultyUpdateRequest({ label: "Odmawianie", userNote: "", archived: "yes" })).toBeNull();
    expect(parseDifficultyUpdateRequest(null)).toBeNull();
    expect(parseDifficultyUpdateRequest("Odmawianie")).toBeNull();
  });

  it("measures limits in Unicode characters", () => {
    expect(parseDifficultyUpdateRequest({ label: "🙂".repeat(TOPIC_LIMITS.label), userNote: "" })).not.toBeNull();
    expect(parseDifficultyUpdateRequest({ label: "🙂".repeat(TOPIC_LIMITS.label + 1), userNote: "" })).toBeNull();
    expect(parseDifficultyUpdateRequest({ label: "O", userNote: "n".repeat(TOPIC_LIMITS.userNote + 1) })).toBeNull();
    expect(parseDifficultyEntryUpdateRequest({ text: "🙂".repeat(TOPIC_LIMITS.entry) })).toEqual({
      text: "🙂".repeat(TOPIC_LIMITS.entry),
    });
    expect(parseDifficultyEntryUpdateRequest({ text: "🙂".repeat(TOPIC_LIMITS.entry + 1) })).toBeNull();
    expect(parseDifficultyEntryUpdateRequest({ text: "   " })).toBeNull();
  });

  it("accepts only the two person decisions and only a UUID merge target", () => {
    expect(parseDifficultyPersonDecisionRequest({ state: "confirmed" })).toEqual({ state: "confirmed" });
    expect(parseDifficultyPersonDecisionRequest({ state: "rejected" })).toEqual({ state: "rejected" });
    expect(parseDifficultyPersonDecisionRequest({ state: "suggested" })).toBeNull();
    expect(parseDifficultyPersonDecisionRequest(null)).toBeNull();
    expect(parseDifficultyMergeRequest({ targetId: ID })).toEqual({ targetId: ID });
    expect(parseDifficultyMergeRequest({ targetId: "odmawianie" })).toBeNull();
    expect(parseDifficultyMergeRequest({})).toBeNull();
  });
});

describe("topic map contract guards", () => {
  const nonResponses = [null, undefined, 5, "x", [], { ok: true }, { ok: false, code: "read_failed" }];

  it("narrows only the exact response shapes", () => {
    expect(isTopicListSuccess({ ok: true, type: "topic_list", cards: [] })).toBe(true);
    expect(isDifficultyUpdateSuccess({ ok: true, type: "difficulty_updated", card: { id: "d" } })).toBe(true);
    expect(isDifficultyDeleted({ ok: true, type: "difficulty_deleted", difficultyId: "d" })).toBe(true);
    expect(
      isDifficultyEntryDeleted({ ok: true, type: "difficulty_entry_deleted", difficultyId: "d", card: null }),
    ).toBe(true);
    expect(isDifficultyMerged({ ok: true, type: "difficulty_merged", sourceId: "s", card: { id: "t" } })).toBe(true);
    expect(isTopicFailure(topicFailure("difficulty_not_found"))).toBe(true);
    for (const value of nonResponses) {
      expect(isTopicListSuccess(value)).toBe(false);
      expect(isDifficultyUpdateSuccess(value)).toBe(false);
      expect(isDifficultyDeleted(value)).toBe(false);
      expect(isDifficultyEntryDeleted(value)).toBe(false);
      expect(isDifficultyMerged(value)).toBe(false);
      expect(isTopicFailure(value)).toBe(false);
    }
  });

  it("maps failure codes to stable statuses, a taken label to 409, and accepts only UUID ids", () => {
    expect(getTopicFailureStatus("missing_auth")).toBe(401);
    expect(getTopicFailureStatus("account_blocked")).toBe(403);
    expect(getTopicFailureStatus("validation_failed")).toBe(400);
    expect(getTopicFailureStatus("difficulty_not_found")).toBe(404);
    expect(getTopicFailureStatus("person_not_found")).toBe(404);
    expect(getTopicFailureStatus("topic_map_unavailable")).toBe(404);
    expect(getTopicFailureStatus("duplicate_difficulty_label")).toBe(409);
    expect(getTopicFailureStatus("merge_failed")).toBe(500);
    expect(getTopicFailureStatus("session_data_unavailable")).toBe(503);
    expect(parseDifficultyIdParam(ID)).toBe(ID);
    expect(parseDifficultyIdParam("odmawianie")).toBeNull();
    expect(isTopicSettingsStatusCode("deleted")).toBe(true);
    expect(isTopicSettingsStatusCode("hacked")).toBe(false);
  });
});
