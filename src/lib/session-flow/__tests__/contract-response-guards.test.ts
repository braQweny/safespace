import { describe, expect, it } from "vitest";
import { isSendSessionMessageResponse } from "@/lib/session-flow/message-contract";
import {
  isSessionHistoryDeleteSuccess,
  isSessionHistoryDetailSuccess,
  isSessionHistoryFailure,
  isSessionHistoryListSuccess,
  sessionHistoryFailure,
} from "@/lib/session-flow/session-history-contract";
import {
  isSessionSummaryApprovedSuccess,
  isSessionSummaryFailure,
  isSessionSummaryGeneratedSuccess,
  sessionSummaryFailure,
} from "@/lib/session-flow/session-summary-contract";

const nonResponses: unknown[] = [null, undefined, "ok", 42, [], { ok: true }, { ok: false }];

describe("session history response guards", () => {
  it("accepts only the matching success discriminants", () => {
    expect(isSessionHistoryListSuccess({ ok: true, type: "session_history_list", avatar: {}, items: [] })).toBe(true);
    expect(isSessionHistoryDetailSuccess({ ok: true, type: "session_history_detail", detail: {} })).toBe(true);
    expect(isSessionHistoryDeleteSuccess({ ok: true, type: "session_history_deleted", deletedSession: {} })).toBe(true);

    expect(isSessionHistoryListSuccess({ ok: true, type: "session_history_detail" })).toBe(false);
    expect(isSessionHistoryDetailSuccess({ ok: false, type: "session_history_detail" })).toBe(false);
    expect(isSessionHistoryDeleteSuccess({ ok: true, type: "session_history_list" })).toBe(false);

    for (const value of nonResponses) {
      expect(isSessionHistoryListSuccess(value)).toBe(false);
      expect(isSessionHistoryDetailSuccess(value)).toBe(false);
      expect(isSessionHistoryDeleteSuccess(value)).toBe(false);
    }
  });

  it("recognizes contract failure responses", () => {
    expect(isSessionHistoryFailure(sessionHistoryFailure("read_failed"))).toBe(true);
    expect(isSessionHistoryFailure({ ok: false, type: "session_history_error" })).toBe(false);

    for (const value of nonResponses) {
      expect(isSessionHistoryFailure(value)).toBe(false);
    }
  });
});

describe("session summary response guards", () => {
  it("accepts only the matching success discriminants", () => {
    expect(isSessionSummaryGeneratedSuccess({ ok: true, type: "session_summary_generated", summary: {} })).toBe(true);
    expect(isSessionSummaryApprovedSuccess({ ok: true, type: "session_summary_approved", summary: {} })).toBe(true);

    expect(isSessionSummaryGeneratedSuccess({ ok: true, type: "session_summary_approved" })).toBe(false);
    expect(isSessionSummaryApprovedSuccess({ ok: false, type: "session_summary_approved" })).toBe(false);

    for (const value of nonResponses) {
      expect(isSessionSummaryGeneratedSuccess(value)).toBe(false);
      expect(isSessionSummaryApprovedSuccess(value)).toBe(false);
    }
  });

  it("recognizes contract failure responses", () => {
    expect(isSessionSummaryFailure(sessionSummaryFailure("provider_unavailable"))).toBe(true);
    expect(isSessionSummaryFailure({ ok: false, type: "session_summary_error" })).toBe(false);

    for (const value of nonResponses) {
      expect(isSessionSummaryFailure(value)).toBe(false);
    }
  });
});

describe("send session message response guard", () => {
  it("accepts any ok/type shaped contract response", () => {
    expect(isSendSessionMessageResponse({ ok: true, type: "success", messages: {}, caution: null })).toBe(true);
    expect(isSendSessionMessageResponse({ ok: false, type: "hard_stop", code: "safety_stop" })).toBe(true);
  });

  it("rejects malformed bodies", () => {
    expect(isSendSessionMessageResponse({ ok: true })).toBe(false);
    expect(isSendSessionMessageResponse({ type: "success" })).toBe(false);

    for (const value of nonResponses) {
      expect(isSendSessionMessageResponse(value)).toBe(false);
    }
  });
});
