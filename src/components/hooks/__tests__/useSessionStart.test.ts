import { afterEach, describe, expect, it, vi } from "vitest";
import { requestSessionStart, resolveFailedStartKind } from "../useSessionStart";

afterEach(() => vi.unstubAllGlobals());

describe("automatic memory preparation during start", () => {
  it("keeps progressing through 202 responses and returns only the started session", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true, type: "avatar_memory_preparing" }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ok: true, type: "avatar_memory_preparing" }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ok: true, session: { id: "new-session" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const progress = vi.fn();
    expect(await requestSessionStart(true, progress)).toMatchObject({
      status: 201,
      body: { session: { id: "new-session" } },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledWith("/api/session/start-next", expect.objectContaining({ method: "POST" }));
    expect(progress.mock.calls).toEqual([[true], [true], [false]]);
  });

  it("stops on failure or throttling, allowing a later click to resume saved progress", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ok: true, type: "avatar_memory_preparing" }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ ok: false, code: "rate_limited" }, { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    expect(await requestSessionStart(true, vi.fn())).toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("resolveFailedStartKind", () => {
  it("returns to the follow-up screen when the trial is simply already used", () => {
    expect(resolveFailedStartKind("trial_already_claimed")).toBe("followup_ready");
    expect(resolveFailedStartKind("no_context_not_confirmed")).toBe("followup_ready");
  });

  it("shows the exhausted free-plan allowance instead of an unknown state", () => {
    expect(resolveFailedStartKind("session_limit_reached")).toBe("session_limit_reached");
  });

  it("treats every other failure as an unknown state", () => {
    expect(resolveFailedStartKind("session_data_unavailable")).toBe("unavailable");
    expect(resolveFailedStartKind(null)).toBe("unavailable");
  });
});
