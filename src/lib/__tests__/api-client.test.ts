import { afterEach, describe, expect, it, vi } from "vitest";
import { isRateLimitedApiResult, isTimedOutApiResult, requestApiJson } from "@/lib/api-client";

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** `fetch`, który nigdy nie odpowiada sam z siebie — tylko odrzuca po przerwaniu. */
function stubHangingFetch() {
  return stubFetch(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("requestApiJson", () => {
  it("returns parsed json body with the response status", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ ok: true, value: 7 }, 201)));

    const result = await requestApiJson("/api/example");

    expect(result).toEqual({
      kind: "json",
      status: 201,
      body: { ok: true, value: 7 },
    });
  });

  it("always sends Accept: application/json and merges provided headers", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await requestApiJson("/api/example", {
      headers: {
        "X-Custom": "yes",
      },
    });

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init?.headers);

    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Custom")).toBe("yes");
    expect(headers.has("Content-Type")).toBe(false);
  });

  it("sets Content-Type: application/json when a body is provided", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await requestApiJson("/api/example", {
      method: "POST",
      body: JSON.stringify({ value: 1 }),
    });

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init?.headers);

    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not override a caller-provided Content-Type", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await requestApiJson("/api/example", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: "raw",
    });

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init?.headers);

    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("returns body null for a non-JSON response body", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response("<html>not json</html>", {
          status: 502,
        }),
      ),
    );

    const result = await requestApiJson("/api/example");

    expect(result).toEqual({
      kind: "json",
      status: 502,
      body: null,
    });
  });

  it("returns network_error when fetch rejects", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const result = await requestApiJson("/api/example");

    expect(result).toEqual({ kind: "network_error" });
    expect(isTimedOutApiResult(result)).toBe(false);
  });
});

/*
 * Bez limitu po stronie klienta zawieszony provider zostawiał wyspę z
 * wirującym wskaźnikiem aż do odświeżenia strony. Limit ma przerwać żądanie,
 * nazwać przyczynę i nie zostawić po sobie tykającego zegara.
 */
describe("requestApiJson timeoutMs", () => {
  it("aborts the request after the deadline and reports it as a timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = stubHangingFetch();

    const pending = requestApiJson("/api/session/message", { method: "POST", timeoutMs: 1_000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toEqual({ kind: "network_error", reason: "timeout" });
    expect(isTimedOutApiResult(result)).toBe(true);
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("does not pass timeoutMs through to fetch", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await requestApiJson("/api/example", { timeoutMs: 5_000 });

    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
  });

  it("clears the deadline once the response arrives", async () => {
    vi.useFakeTimers();
    stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    const result = await requestApiJson("/api/example", { timeoutMs: 5_000 });

    expect(result.kind).toBe("json");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a caller-side abort distinct from a timeout", async () => {
    vi.useFakeTimers();
    stubHangingFetch();
    const controller = new AbortController();

    const pending = requestApiJson("/api/example", { signal: controller.signal, timeoutMs: 5_000 });
    controller.abort();
    const result = await pending;

    expect(result).toEqual({ kind: "network_error" });
    expect(isTimedOutApiResult(result)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a non-positive deadline", async () => {
    vi.useFakeTimers();
    stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    const result = await requestApiJson("/api/example", { timeoutMs: 0 });

    expect(result.kind).toBe("json");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("isRateLimitedApiResult", () => {
  it("detects the middleware rate limit response", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ ok: false, code: "rate_limited" }, 429)));

    const result = await requestApiJson("/api/session/message", { method: "POST" });

    expect(isRateLimitedApiResult(result)).toBe(true);
  });

  it("ignores other statuses and network errors", () => {
    expect(isRateLimitedApiResult({ kind: "json", status: 409, body: { ok: false } })).toBe(false);
    expect(isRateLimitedApiResult({ kind: "network_error" })).toBe(false);
  });
});
