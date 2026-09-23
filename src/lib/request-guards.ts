/**
 * Request-shape guards evaluated by the middleware before any route parses a
 * body. They live here (not in `src/middleware.ts`) so they can be unit
 * tested — vitest only collects tests under `src/lib/**`.
 */

// Generous compared to the largest accepted regular API payload (a 3000-char
// session message); the transcription route gets a separate cap because WebM
// audio is base64-encoded JSON.
export const API_BODY_LIMIT_BYTES = 32 * 1024;
export const TRANSCRIPTION_API_BODY_LIMIT_BYTES = 7 * 1024 * 1024;
// A WebRTC offer is ~2 KB; the cap only has to admit a long ICE candidate list.
export const VOICE_CONNECT_API_BODY_LIMIT_BYTES = 64 * 1024;
const TRANSCRIPTION_API_PATH = "/api/session/transcribe";
const VOICE_CONNECT_API_PATH = "/api/session/voice/connect";
const API_BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export type ApiBodyGuardReasonCode = "length_required" | "payload_too_large";

const MAX_PATHNAME_DECODE_PASSES = 3;

/**
 * The pathname every path-based guard compares against. Astro routes
 * `/api/session/message/`, `/api/session//message` and `/api/session/%6Dessage`
 * to the same handler as `/api/session/message`, so exact-match allowlists
 * (rate limits, body caps, protected routes) must see them the same way —
 * otherwise a trailing slash skips the limiter entirely. Guards only ever
 * widen with this: a variant that no route serves just meets a stricter check.
 */
export function normalizeGuardPathname(pathname: string) {
  let decoded = pathname;

  for (let pass = 0; pass < MAX_PATHNAME_DECODE_PASSES; pass += 1) {
    let next: string;

    try {
      next = decodeURIComponent(decoded);
    } catch {
      break;
    }

    if (next === decoded) break;
    decoded = next;
  }

  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, "/");
  const trimmed = collapsed.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const BLOCKED_ACCOUNT_PATH = "/account/blocked";
export const ACCOUNT_ACCESS_UNAVAILABLE_PATH = `${BLOCKED_ACCOUNT_PATH}?state=unavailable`;

/**
 * Where a request that failed the account-access gate is sent: a blocked
 * account lands on the blocked page, an unreadable access state on the same
 * page in its "could not verify" variant (never a false "you are blocked").
 * Shared by the middleware and by the form routes that guard themselves.
 */
export function getAccountAccessRedirectPath(code: string) {
  return code === "account_blocked" ? BLOCKED_ACCOUNT_PATH : ACCOUNT_ACCESS_UNAVAILABLE_PATH;
}

export type ApiBodyGuardVerdict =
  | { ok: true }
  | { ok: false; status: 411; reasonCode: "length_required" }
  | { ok: false; status: 413; reasonCode: "payload_too_large" };

const ALLOWED: ApiBodyGuardVerdict = { ok: true };
const LENGTH_REQUIRED: ApiBodyGuardVerdict = { ok: false, status: 411, reasonCode: "length_required" };
const PAYLOAD_TOO_LARGE: ApiBodyGuardVerdict = { ok: false, status: 413, reasonCode: "payload_too_large" };

export function getApiBodyLimitBytes(pathname: string) {
  const path = normalizeGuardPathname(pathname);

  if (path === TRANSCRIPTION_API_PATH) {
    return TRANSCRIPTION_API_BODY_LIMIT_BYTES;
  }

  if (path === VOICE_CONNECT_API_PATH) {
    return VOICE_CONNECT_API_BODY_LIMIT_BYTES;
  }

  return API_BODY_LIMIT_BYTES;
}

function parseContentLength(header: string) {
  const trimmed = header.trim();

  if (!/^\d{1,15}$/.test(trimmed)) {
    return null;
  }

  return Number(trimmed);
}

/**
 * Bounds `/api/*` request bodies by their declared `Content-Length`.
 *
 * A body without a declared length (chunked/streamed upload, or a header the
 * runtime could not parse) used to slip past the size check entirely; it is
 * now refused with 411 so the cap cannot be bypassed by simply omitting the
 * header. A request that carries no body at all (`request.body === null`, e.g.
 * a bodiless `POST /api/session/start`) has nothing to bound and stays
 * allowed — 411 only applies where there is a body without a length.
 */
export function evaluateApiBodyGuard(
  request: Pick<Request, "method" | "headers" | "body">,
  pathname: string,
): ApiBodyGuardVerdict {
  const path = normalizeGuardPathname(pathname);

  if (!path.startsWith("/api/") || !API_BODY_METHODS.has(request.method)) {
    return ALLOWED;
  }

  // The webhook reader enforces its separate 256 KiB streaming cap, including
  // absent or dishonest Content-Length. Ordinary API routes still require it.
  if (path === "/api/billing/webhook") return ALLOWED;

  const header = request.headers.get("content-length");

  if (header === null) {
    return request.body === null ? ALLOWED : LENGTH_REQUIRED;
  }

  const contentLength = parseContentLength(header);

  if (contentLength === null) {
    return LENGTH_REQUIRED;
  }

  return contentLength > getApiBodyLimitBytes(path) ? PAYLOAD_TOO_LARGE : ALLOWED;
}
