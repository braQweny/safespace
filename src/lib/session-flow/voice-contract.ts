import type { OpenAiLiveErrorCategory } from "@/lib/openai/live";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import { isRecord } from "@/lib/type-guards";
import type { VoiceCloseReason } from "@/lib/voice/observer-state";
import type { SessionMessageViewModel } from "./message-contract";
import { parseSessionIdParam } from "./session-id";
import type { SessionView } from "./session-state";

/**
 * Kontrakt tras rozmowy głosowej (`POST /api/session/voice/connect` i
 * `/heartbeat`). Ręczne guardy jak w pozostałych kontraktach: zła oferta SDP
 * czy nie-UUID to 400 zamiast błędu dalej w łańcuchu. Odpowiedzi niosą tylko
 * to, co klient musi wiedzieć: odpowiedź SDP, termin, epokę połączenia, nasz
 * powód zamknięcia i zapisane wypowiedzi — nigdy identyfikator sesji live.
 */

/** Oferta Chrome ma ~2 KB (spike S1); 64 KiB to bezpieczny sufit także dla ICE trickle. */
export const VOICE_SDP_MAX_CHARS = 64 * 1024;

export interface VoiceConnectRequest {
  sessionId: string;
  sdp: string;
}

export interface VoiceHeartbeatRequest {
  sessionId: string;
  /** Epoka połączenia z odpowiedzi `connect`; echo w odpowiedzi, fencing po stronie klienta. */
  epoch: number;
}

export type VoiceRouteFailureCode =
  | "validation_failed"
  | "missing_auth"
  | "account_blocked"
  | "account_access_unavailable"
  | "session_data_unavailable"
  | "session_not_found"
  | "session_not_active"
  | "session_expired"
  | "session_mode_mismatch"
  | "voice_unavailable"
  | "voice_minutes_exhausted"
  | "voice_trial_used"
  | "voice_provider_unavailable"
  | "voice_observer_unavailable"
  | "voice_connect_failed"
  | "voice_heartbeat_failed";

export type VoiceRouteFailureResponse =
  | { ok: false; type: "validation_failed"; code: "validation_failed" }
  | { ok: false; type: "expired"; code: "session_expired"; session: SessionView }
  | {
      ok: false;
      type: "voice_error";
      code: Exclude<VoiceRouteFailureCode, "validation_failed" | "session_expired">;
      /** Tylko przy `voice_provider_unavailable`: zamknięta kategoria błędu transportu. */
      category?: OpenAiLiveErrorCategory;
    };

export interface VoiceConnectSuccessResponse {
  ok: true;
  type: "voice_connected";
  /** Odpowiedź SDP dostawcy dla `setRemoteDescription`. */
  sdp: string;
  /** Termin tego połączenia: `expires_at` albo wcześniej, gdy pula minut kończy się przed nim. */
  expiresAt: string | null;
  serverNow: string;
  epoch: number;
  /** `true`, gdy ta rozmowa miała już wcześniej połączenie audio (wznowienie). */
  reconnected: boolean;
  session: SessionView;
}

export type VoiceHeartbeatNotice =
  | { variant: "hard_stop"; copy: SessionSafetyCopy; crisisResources: readonly CrisisResourceRegion[] }
  | { variant: "retry"; copy: SessionSafetyCopy };

export interface VoiceHeartbeatSuccessResponse {
  ok: true;
  type: "voice_heartbeat";
  /** Sesja live nadal otwarta po naszej stronie. */
  live: boolean;
  closeReason: VoiceCloseReason | null;
  epoch: number;
  remainingSeconds: number | null;
  serverNow: string;
  session: SessionView;
  /** Wypowiedzi zapisane tym heartbeatem (zrzut bufora obserwatora), w kolejności zapisu. */
  messages: SessionMessageViewModel[];
  notice?: VoiceHeartbeatNotice;
}

export type VoiceConnectResponse = VoiceConnectSuccessResponse | VoiceRouteFailureResponse;
export type VoiceHeartbeatResponse = VoiceHeartbeatSuccessResponse | VoiceRouteFailureResponse;

export function getVoiceRouteFailureStatus(code: VoiceRouteFailureCode): number {
  switch (code) {
    case "validation_failed":
      return 400;
    case "missing_auth":
      return 401;
    case "account_blocked":
    case "voice_unavailable":
    case "voice_minutes_exhausted":
    case "voice_trial_used":
      return 403;
    case "session_not_found":
      return 404;
    case "session_not_active":
    case "session_expired":
    case "session_mode_mismatch":
      return 409;
    default:
      return 503;
  }
}

export function voiceRouteFailure(
  code: Exclude<VoiceRouteFailureCode, "validation_failed" | "session_expired">,
  category?: OpenAiLiveErrorCategory,
): VoiceRouteFailureResponse {
  return { ok: false, type: "voice_error", code, ...(category ? { category } : {}) };
}

export function voiceRouteValidationFailure(): VoiceRouteFailureResponse {
  return { ok: false, type: "validation_failed", code: "validation_failed" };
}

export function voiceRouteExpired(session: SessionView): VoiceRouteFailureResponse {
  return { ok: false, type: "expired", code: "session_expired", session };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return null;
  }

  return isRecord(body) ? body : null;
}

// SDP jest tekstem liniowym: poza CR i LF żaden znak sterujący nie jest ofertą.
// eslint-disable-next-line no-control-regex -- właśnie znaki sterujące są tu odrzucane
const SDP_FORBIDDEN_CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

/** Oferta WebRTC: tekst SDP zaczynający się od `v=0`, bez znaków sterujących poza CR/LF, w limicie. */
export function parseVoiceSdpOffer(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const sdp = value.trim();

  if (sdp.length === 0 || sdp.length > VOICE_SDP_MAX_CHARS || !sdp.startsWith("v=0")) {
    return null;
  }

  if (SDP_FORBIDDEN_CONTROL_CHARS.test(sdp)) {
    return null;
  }

  // SDP wymaga terminatora po każdej linii, także ostatniej (RFC 8866).
  // Przycięcie zjada końcowy CRLF oferty z przeglądarki, a parser dostawcy
  // odrzuca wtedy całą ofertę („failed to unmarshal SDP: EOF”, HTTP 400) —
  // dlatego terminator wraca w stylu, którego używa sama oferta.
  return `${sdp}${sdp.includes("\r\n") ? "\r\n" : "\n"}`;
}

export async function parseVoiceConnectRequest(request: Request): Promise<VoiceConnectRequest | null> {
  const body = await readJsonBody(request);

  if (!body) {
    return null;
  }

  const sessionId = parseSessionIdParam(typeof body.sessionId === "string" ? body.sessionId : undefined);
  const sdp = parseVoiceSdpOffer(body.sdp);

  return sessionId && sdp ? { sessionId, sdp } : null;
}

export async function parseVoiceHeartbeatRequest(request: Request): Promise<VoiceHeartbeatRequest | null> {
  const body = await readJsonBody(request);

  if (!body) {
    return null;
  }

  const sessionId = parseSessionIdParam(typeof body.sessionId === "string" ? body.sessionId : undefined);
  const epoch = body.epoch;

  if (!sessionId || typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0) {
    return null;
  }

  return { sessionId, epoch };
}

/**
 * Termin rozmowy głosowej, który widzi klient: `expires_at` z bazy albo
 * wcześniejszy termin obserwatora, gdy `connect` przyciął go do reszty puli
 * minut (w bazie `expires_at` jest zamrożone od pierwszego połączenia). Timer
 * klienta liczy od tego pola, więc obie trasy — `connect` i heartbeat — oddają
 * ten sam.
 */
export function withVoiceDeadline<T extends { expiresAt: string | null }>(
  session: T,
  effectiveExpiresAtMs: number | null,
): T {
  if (effectiveExpiresAtMs === null || !Number.isFinite(effectiveExpiresAtMs)) {
    return session;
  }

  const storedMs = session.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;

  if (Number.isFinite(storedMs) && effectiveExpiresAtMs >= storedMs) {
    return session;
  }

  return { ...session, expiresAt: new Date(effectiveExpiresAtMs).toISOString() };
}

/**
 * Okno rozmowy głosowej po pierwszym połączeniu audio — to samo, co zapisuje
 * trigger metadanych w bazie: start przesunięty na chwilę połączenia, termin o
 * tyle samo (długość bez zmian), start nigdy się nie cofa. Tylko do
 * przewidzenia okna przed zapisem połączenia (faza powitania); obowiązuje
 * wiersz z bazy po zapisie.
 */
export function shiftVoiceWindowToConnection<T extends { startedAt: string | null; expiresAt: string | null }>(
  session: T,
  connectedAtMs: number,
): T {
  const startedAtMs = session.startedAt ? Date.parse(session.startedAt) : Number.NaN;
  const expiresAtMs = session.expiresAt ? Date.parse(session.expiresAt) : Number.NaN;

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(expiresAtMs) || !Number.isFinite(connectedAtMs)) {
    return session;
  }

  const shiftMs = Math.max(0, connectedAtMs - startedAtMs);

  if (shiftMs === 0) {
    return session;
  }

  return {
    ...session,
    startedAt: new Date(startedAtMs + shiftMs).toISOString(),
    expiresAt: new Date(expiresAtMs + shiftMs).toISOString(),
  };
}

/**
 * Rozmowa głosowa, która jeszcze nie miała połączenia audio: jej zegar nie
 * ruszył, a jednorazowa próba (albo minuty puli) nie zostały zużyte. Brak pola
 * (starszy widok) to nie „niepołączona” — nie obiecujemy, że nic nie przepadło.
 */
export function isVoiceAwaitingFirstConnection(
  session: Pick<SessionView, "mode" | "voiceConnected"> | null | undefined,
) {
  return session?.mode === "voice" && session.voiceConnected === false;
}

export function isVoiceSession(session: Pick<SessionView, "mode"> | null | undefined) {
  return session?.mode === "voice";
}

export function isVoiceConnectResponse(value: unknown): value is VoiceConnectResponse {
  return isRecord(value) && typeof value.ok === "boolean" && typeof value.type === "string";
}

export function isVoiceHeartbeatResponse(value: unknown): value is VoiceHeartbeatResponse {
  return isRecord(value) && typeof value.ok === "boolean" && typeof value.type === "string";
}
