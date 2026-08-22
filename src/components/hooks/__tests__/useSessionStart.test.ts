import { describe, expect, it } from "vitest";
import { resolveFailedStartKind, resolveStartWithoutContext } from "../useSessionStart";

describe("resolveStartWithoutContext", () => {
  const followupWithContext = {
    isFollowupStart: true,
    canStartWithoutContext: true,
    approvedSummaryCount: 2,
    requestedWithoutContext: false,
  };

  it("keeps approved context unless the user opts out", () => {
    expect(resolveStartWithoutContext(followupWithContext)).toBe(false);
    expect(resolveStartWithoutContext({ ...followupWithContext, requestedWithoutContext: true })).toBe(true);
  });

  it("confirms the context-free start implicitly when there is nothing to carry over", () => {
    expect(resolveStartWithoutContext({ ...followupWithContext, approvedSummaryCount: 0 })).toBe(true);
  });

  it("never declares a context-free start outside an offered follow-up", () => {
    expect(
      resolveStartWithoutContext({
        ...followupWithContext,
        isFollowupStart: false,
        approvedSummaryCount: 0,
        requestedWithoutContext: true,
      }),
    ).toBe(false);
    expect(
      resolveStartWithoutContext({
        ...followupWithContext,
        canStartWithoutContext: false,
        requestedWithoutContext: true,
      }),
    ).toBe(false);
  });
});

describe("resolveFailedStartKind", () => {
  it("returns to the follow-up screen when the trial is simply already used", () => {
    expect(resolveFailedStartKind("trial_already_claimed")).toBe("followup_ready");
    expect(resolveFailedStartKind("no_context_not_confirmed")).toBe("followup_ready");
  });

  it("treats every other failure as an unknown state", () => {
    expect(resolveFailedStartKind("session_data_unavailable")).toBe("unavailable");
    expect(resolveFailedStartKind(null)).toBe("unavailable");
  });
});
