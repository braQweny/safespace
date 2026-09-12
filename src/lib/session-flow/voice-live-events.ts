import { isRecord } from "@/lib/type-guards";

/**
 * Parser zdarzeń GPT-Live wspólny dla przeglądarki (data channel) i
 * obserwatora (sideband). Nazwy potwierdzone w spike'u: prefiks `session.`
 * (`session.input_transcript.delta`, `session.output_transcript.delta`,
 * `session.started`, `session.closed`, `session.usage.updated`,
 * `session.*.appended`, `session.input_audio.muted|unmuted`), koperty
 * `response.event` i `session.delegation.created`. Nieznane zdarzenia są
 * ignorowane, nigdy nie rzucają; treść delt nie jest logowana.
 */
export type VoiceLiveEvent =
  | { kind: "session_started"; liveSessionId: string | null; expiresAtSeconds: number | null }
  | { kind: "input_fragment"; delta: string; startMs: number; endMs: number }
  | { kind: "output_fragment"; delta: string; startMs: number; endMs: number }
  | { kind: "session_closed"; reason: string | null; usageSeconds: number | null }
  | { kind: "usage_updated"; usageSeconds: number | null }
  | { kind: "acknowledged"; type: string; clientEventId: string | null }
  | { kind: "error"; code: string | null; clientEventId: string | null }
  | { kind: "delegation_created"; delegationId: string | null }
  | { kind: "ignored"; type: string | null };

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function typeMatches(type: string, suffix: string) {
  return type === suffix || type.endsWith(`.${suffix}`);
}

export function parseVoiceLiveEvent(raw: unknown): VoiceLiveEvent {
  let payload: unknown = raw;

  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return { kind: "ignored", type: null };
    }
  }

  if (!isRecord(payload) || typeof payload.type !== "string") {
    return { kind: "ignored", type: null };
  }

  const type = payload.type;

  if (typeMatches(type, "input_transcript.delta") || typeMatches(type, "output_transcript.delta")) {
    const delta = readString(payload.delta);
    const startMs = readNumber(payload.start_ms);
    const endMs = readNumber(payload.end_ms);

    if (delta === null || startMs === null || endMs === null) {
      return { kind: "ignored", type };
    }

    return {
      kind: typeMatches(type, "input_transcript.delta") ? "input_fragment" : "output_fragment",
      delta,
      startMs,
      endMs,
    };
  }

  if (typeMatches(type, "session.started")) {
    const session = isRecord(payload.session) ? payload.session : null;

    return {
      kind: "session_started",
      liveSessionId: session ? readString(session.id) : null,
      expiresAtSeconds: session ? readNumber(session.expires_at) : null,
    };
  }

  if (typeMatches(type, "session.closed")) {
    const usage = isRecord(payload.usage) ? payload.usage : null;

    return {
      kind: "session_closed",
      reason: readString(payload.reason),
      usageSeconds: usage ? readNumber(usage.seconds) : null,
    };
  }

  if (typeMatches(type, "usage.updated")) {
    const usage = isRecord(payload.usage) ? payload.usage : null;

    return { kind: "usage_updated", usageSeconds: usage ? readNumber(usage.seconds) : null };
  }

  if (type === "error") {
    const error = isRecord(payload.error) ? payload.error : null;

    return {
      kind: "error",
      code: error ? readString(error.code) : null,
      clientEventId: (error ? readString(error.client_event_id) : null) ?? readString(payload.client_event_id),
    };
  }

  if (typeMatches(type, "delegation.created")) {
    const delegation = isRecord(payload.delegation) ? payload.delegation : null;

    return { kind: "delegation_created", delegationId: delegation ? readString(delegation.id) : null };
  }

  if (/\.(appended|muted|unmuted|updated)$/.test(type)) {
    return { kind: "acknowledged", type, clientEventId: readString(payload.client_event_id) };
  }

  return { kind: "ignored", type };
}
