/**
 * Minimal browser-safe JSON API client shared by React islands.
 *
 * The client only owns transport concerns: headers, network failures, JSON
 * parsing and an optional client-side deadline. Callers keep narrowing `body`
 * with their contract type guards — there are no `as T` casts here on purpose.
 */
export type ApiJsonResult =
  | { kind: "json"; status: number; body: unknown }
  | {
      kind: "network_error";
      /**
       * Present only when the request was cut short by the caller's `timeoutMs`.
       * A plain unreachable server or a caller-side abort carries no reason, so
       * existing `{ kind: "network_error" }` checks keep working unchanged.
       */
      reason?: "timeout";
    };

export interface ApiJsonRequestInit extends RequestInit {
  /**
   * Client-side deadline for the whole request, body read included. Without
   * it a stalled upstream (an AI provider that never answers) leaves the
   * island waiting forever with no way to recover but a page reload.
   */
  timeoutMs?: number;
}

/**
 * Middleware-level rate limiting (429) happens before any route contract, so
 * islands detect it here instead of in per-route type guards.
 */
export function isRateLimitedApiResult(result: ApiJsonResult) {
  return result.kind === "json" && result.status === 429;
}

export function isTimedOutApiResult(result: ApiJsonResult) {
  return result.kind === "network_error" && result.reason === "timeout";
}

export async function requestApiJson(input: string, init?: ApiJsonRequestInit): Promise<ApiJsonResult> {
  const { timeoutMs, ...fetchInit } = init ?? {};
  const headers = new Headers(fetchInit.headers);
  headers.set("Accept", "application/json");

  if (fetchInit.body !== undefined && fetchInit.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const deadline = createRequestDeadline(timeoutMs, fetchInit.signal);

  try {
    let response: Response;

    try {
      response = await fetch(input, {
        ...fetchInit,
        headers,
        signal: deadline.signal,
      });
    } catch {
      return deadline.timedOut ? { kind: "network_error", reason: "timeout" } : { kind: "network_error" };
    }

    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      // A deadline that fires mid-body is still a timeout, not a JSON-less reply.
      if (deadline.timedOut) {
        return { kind: "network_error", reason: "timeout" };
      }

      body = null;
    }

    return {
      kind: "json",
      status: response.status,
      body,
    };
  } finally {
    deadline.dispose();
  }
}

interface RequestDeadline {
  signal: AbortSignal | null | undefined;
  readonly timedOut: boolean;
  dispose: () => void;
}

/**
 * Combines the caller's own `signal` with the timeout into one signal, so an
 * island that already aborts on unmount keeps that behaviour and gets the
 * deadline on top. Everything registered here is torn down in `dispose()`.
 */
function createRequestDeadline(timeoutMs: number | undefined, callerSignal: AbortSignal | null | undefined) {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: callerSignal,
      timedOut: false,
      dispose: () => undefined,
    } satisfies RequestDeadline;
  }

  const controller = new AbortController();
  let timedOut = false;
  const forwardCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    get timedOut() {
      return timedOut;
    },
    dispose: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener("abort", forwardCallerAbort);
    },
  } satisfies RequestDeadline;
}
