import { describe, expect, it } from "vitest";
import {
  API_BODY_LIMIT_BYTES,
  TRANSCRIPTION_API_BODY_LIMIT_BYTES,
  VOICE_CONNECT_API_BODY_LIMIT_BYTES,
  evaluateApiBodyGuard,
  getAccountAccessRedirectPath,
  getApiBodyLimitBytes,
} from "../request-guards";

function request(
  method: string,
  options: { contentLength?: string; body?: string | null } = {},
): Pick<Request, "method" | "headers" | "body"> {
  const headers = new Headers();

  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }

  // `new Request()` never copies a Content-Length onto `headers` (browsers
  // compute it on send), so the header and the body are set independently —
  // exactly the split the guard has to reason about.
  const body = options.body === undefined ? "{}" : options.body;

  return new Request("https://safespace.local/api/x", {
    method,
    headers,
    ...(body === null ? {} : { body }),
  });
}

describe("evaluateApiBodyGuard", () => {
  it("only guards body-carrying methods under /api", () => {
    expect(evaluateApiBodyGuard(request("GET", { body: null }), "/api/session/history")).toEqual({ ok: true });
    expect(evaluateApiBodyGuard(request("DELETE", { body: null }), "/api/session/history/x")).toEqual({ ok: true });
    expect(evaluateApiBodyGuard(request("POST"), "/dashboard/session")).toEqual({ ok: true });
  });

  it("accepts a declared length within the limit", () => {
    expect(evaluateApiBodyGuard(request("POST", { contentLength: "1024" }), "/api/session/message")).toEqual({
      ok: true,
    });
    expect(
      evaluateApiBodyGuard(request("POST", { contentLength: String(API_BODY_LIMIT_BYTES) }), "/api/session/message"),
    ).toEqual({ ok: true });
  });

  it("rejects a declared length over the limit with 413", () => {
    expect(
      evaluateApiBodyGuard(
        request("POST", { contentLength: String(API_BODY_LIMIT_BYTES + 1) }),
        "/api/session/message",
      ),
    ).toEqual({ ok: false, status: 413, reasonCode: "payload_too_large" });
    expect(evaluateApiBodyGuard(request("PATCH", { contentLength: "999999" }), "/api/session/summary/x")).toEqual({
      ok: false,
      status: 413,
      reasonCode: "payload_too_large",
    });
  });

  it("gives the transcription route its own, larger cap", () => {
    expect(getApiBodyLimitBytes("/api/session/transcribe")).toBe(TRANSCRIPTION_API_BODY_LIMIT_BYTES);
    expect(getApiBodyLimitBytes("/api/session/message")).toBe(API_BODY_LIMIT_BYTES);

    const fiveMegabytes = String(5 * 1024 * 1024);
    expect(evaluateApiBodyGuard(request("POST", { contentLength: fiveMegabytes }), "/api/session/transcribe")).toEqual({
      ok: true,
    });
    expect(
      evaluateApiBodyGuard(
        request("POST", { contentLength: String(TRANSCRIPTION_API_BODY_LIMIT_BYTES + 1) }),
        "/api/session/transcribe",
      ),
    ).toEqual({ ok: false, status: 413, reasonCode: "payload_too_large" });
  });

  it("refuses a body without a declared length with 411 instead of skipping the cap", () => {
    // This is the bypass: a chunked/streamed upload used to pass because the
    // check only looked at a header that was not there.
    expect(evaluateApiBodyGuard(request("POST"), "/api/session/message")).toEqual({
      ok: false,
      status: 411,
      reasonCode: "length_required",
    });
    expect(evaluateApiBodyGuard(request("PUT"), "/api/profile/avatar")).toEqual({
      ok: false,
      status: 411,
      reasonCode: "length_required",
    });
  });

  it("refuses an unparsable declared length with 411", () => {
    for (const contentLength of ["abc", "-1", "1e5", "12 34", "", "0x10", "9".repeat(40)]) {
      expect(evaluateApiBodyGuard(request("POST", { contentLength }), "/api/session/message")).toEqual({
        ok: false,
        status: 411,
        reasonCode: "length_required",
      });
    }
  });

  it("lets a bodiless request through — there is nothing to bound", () => {
    // `POST /api/session/start` and `POST /api/session/summary/:id` are sent
    // without a body; browsers add `Content-Length: 0`, but a runtime that
    // drops it must not turn those into 411s.
    expect(evaluateApiBodyGuard(request("POST", { body: null }), "/api/session/start")).toEqual({ ok: true });
    expect(evaluateApiBodyGuard(request("POST", { body: null, contentLength: "0" }), "/api/session/start")).toEqual({
      ok: true,
    });
  });
});

describe("getAccountAccessRedirectPath", () => {
  it("sends blocked accounts to the blocked page and unreadable access to its unavailable variant", () => {
    expect(getAccountAccessRedirectPath("account_blocked")).toBe("/account/blocked");
    expect(getAccountAccessRedirectPath("account_access_unavailable")).toBe("/account/blocked?state=unavailable");
    expect(getAccountAccessRedirectPath("missing_auth")).toBe("/account/blocked?state=unavailable");
  });
});

describe("voice connect body cap", () => {
  it("admits a 64 KiB WebRTC offer on the connect route only; the heartbeat keeps the default cap", () => {
    expect(getApiBodyLimitBytes("/api/session/voice/connect")).toBe(VOICE_CONNECT_API_BODY_LIMIT_BYTES);
    expect(getApiBodyLimitBytes("/api/session/voice/heartbeat")).toBe(API_BODY_LIMIT_BYTES);
    expect(
      evaluateApiBodyGuard(
        request("POST", { contentLength: String(VOICE_CONNECT_API_BODY_LIMIT_BYTES) }),
        "/api/session/voice/connect",
      ),
    ).toEqual({ ok: true });
    expect(
      evaluateApiBodyGuard(
        request("POST", { contentLength: String(VOICE_CONNECT_API_BODY_LIMIT_BYTES + 1) }),
        "/api/session/voice/connect",
      ),
    ).toEqual({ ok: false, status: 413, reasonCode: "payload_too_large" });
    expect(
      evaluateApiBodyGuard(
        request("POST", { contentLength: String(API_BODY_LIMIT_BYTES + 1) }),
        "/api/session/voice/heartbeat",
      ),
    ).toEqual({ ok: false, status: 413, reasonCode: "payload_too_large" });
  });
});
