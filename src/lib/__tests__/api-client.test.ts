import { afterEach, describe, expect, it, vi } from "vitest";
import { requestApiJson } from "@/lib/api-client";

function stubFetch(impl: (input: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
  });
});
