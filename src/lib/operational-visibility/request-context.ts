import type { User } from "@supabase/supabase-js";
import { OPERATIONAL_LOG_HASH_SECRET } from "astro:env/server";
import { hashOperationalUserId } from "./user-hash";
import type { OperationalEvent } from "./types";

export const OPERATIONAL_REQUEST_ID_HEADER = "X-SafeSpace-Request-Id";

interface OperationalContextSource {
  locals: {
    requestId?: string;
    user?: Pick<User, "id"> | null;
  };
  request: Pick<Request, "method">;
  url: Pick<URL, "pathname">;
}

export type OperationalRequestContext = Partial<
  Pick<OperationalEvent, "requestId" | "route" | "method" | "durationMs" | "userHash">
>;

function randomHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createOperationalRequestId() {
  try {
    if (typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);

    return `req_${randomHex(bytes)}`;
  } catch {
    return `req_${Date.now().toString(36)}`;
  }
}

export function withOperationalRequestIdHeader(response: Response, requestId: string) {
  if (!requestId) {
    return response;
  }

  try {
    response.headers.set(OPERATIONAL_REQUEST_ID_HEADER, requestId);
    return response;
  } catch {
    try {
      const headers = new Headers(response.headers);
      headers.set(OPERATIONAL_REQUEST_ID_HEADER, requestId);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  }
}

export async function buildOperationalRequestContext(
  context: OperationalContextSource,
): Promise<OperationalRequestContext> {
  const userHash = await hashOperationalUserId(context.locals.user?.id, OPERATIONAL_LOG_HASH_SECRET);

  return {
    requestId: context.locals.requestId,
    route: context.url.pathname,
    method: context.request.method,
    ...(userHash ? { userHash } : {}),
  };
}

export function getOperationalDurationMs(startedAtMs: number, endedAtMs = performance.now()) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) {
    return undefined;
  }

  return Math.round(endedAtMs - startedAtMs);
}
