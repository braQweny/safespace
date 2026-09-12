import { parseVoiceLiveEvent } from "@/lib/session-flow/voice-live-events";
import { isRecord } from "@/lib/type-guards";
import { VOICE_SIDEBAND_ACK_TIMEOUT_MS } from "@/lib/voice/constants";

/**
 * Transport GPT-Live (OpenAI, endpointy `v1/live/sessions`). Tylko WebRTC
 * przez REST i krótkotrwały lub rotowany sideband; transport WebSocket
 * `/v1/live` jest alfą niedostępną dla projektu (spike S5).
 *
 * Reguły jak w `chat.ts`: klucz OpenRouter (`sk-or-`) odrzucony, `redirect:
 * "manual"`, ciała błędów anulowane i nigdy nie zatrzymywane, zamknięte
 * kategorie błędów. Treści wysyłane po sideband to copy i prompt, nigdy tekst
 * użytkownika; identyfikator sesji live nie trafia do logów.
 */
export const OPENAI_LIVE_MODEL = "gpt-live-1";
const OPENAI_LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
const OPENAI_LIVE_ATTACH_URL = "wss://api.openai.com/v1/live/sessions";
const DEFAULT_TIMEOUT_MS = 12_000;

export type OpenAiLiveErrorCategory =
  | "missing_configuration"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "invalid_provider_response";

export class OpenAiLiveError extends Error {
  readonly category: OpenAiLiveErrorCategory;

  constructor(category: OpenAiLiveErrorCategory) {
    super(category);
    this.name = "OpenAiLiveError";
    this.category = category;
  }
}

/**
 * Głosy przyjęte przez `POST /v1/live/sessions` dla `gpt-live-1` (sonda z
 * 2026-09-12: każda z tych nazw dała 201, nieznana nazwa daje 403 „Voice
 * session access denied”). Odsłuchane w spike'u: `marin`; `cedar` to drugi
 * głos rekomendowany przez OpenAI dla modeli mówionych.
 */
export const OPENAI_LIVE_VOICES = [
  "marin",
  "cedar",
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
] as const;

export type OpenAiLiveVoice = (typeof OPENAI_LIVE_VOICES)[number];

export function isOpenAiLiveVoice(value: unknown): value is OpenAiLiveVoice {
  return typeof value === "string" && (OPENAI_LIVE_VOICES as readonly string[]).includes(value);
}

/** Konfiguracja przyjęta przez `POST /v1/live/sessions` (spike S1/S5). */
export interface LiveSessionConfig {
  model: typeof OPENAI_LIVE_MODEL;
  store: false;
  instructions: string;
  audio: { output: { voice: OpenAiLiveVoice } };
  delegation: {
    type: "responses";
    responses: {
      model: string;
      instructions: string;
      reasoning: { effort: "low" };
      max_output_tokens: number;
    };
  };
}

interface TransportOptions {
  apiKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

function requireKey(apiKey: string) {
  const key = apiKey.trim();

  if (!key || key.startsWith("sk-or-")) {
    throw new OpenAiLiveError("missing_configuration");
  }

  return key;
}

function mapStatus(status: number): OpenAiLiveErrorCategory {
  if (status === 429) {
    return "provider_rate_limited";
  }

  if (status === 408 || status === 504) {
    return "provider_timeout";
  }

  if (status === 400 || status === 422) {
    return "invalid_provider_response";
  }

  return "provider_unavailable";
}

async function postJson(path: string, body: unknown, options: TransportOptions) {
  const key = requireKey(options.apiKey);
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    return await fetcher(
      new Request(`${OPENAI_LIVE_SESSIONS_URL}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        // workerd only supports follow/manual; never forward the key or content
        // to a redirect target.
        redirect: "manual",
      }),
    );
  } catch (error) {
    if (error instanceof OpenAiLiveError) {
      throw error;
    }

    throw new OpenAiLiveError(controller.signal.aborted ? "provider_timeout" : "provider_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export interface CreateLiveSessionInput extends TransportOptions {
  /** Oferta SDP przeglądarki; serwer tworzy sesję, klucz nigdy nie opuszcza Workera. */
  sdp: string;
  session: LiveSessionConfig;
}

export interface CreatedLiveSession {
  liveSessionId: string;
  answerSdp: string;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<CreatedLiveSession> {
  const response = await postJson("", { session: input.session, transport: { type: "webrtc", sdp: input.sdp } }, input);

  if (!response.ok) {
    await response.body?.cancel();
    throw new OpenAiLiveError(mapStatus(response.status));
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new OpenAiLiveError("invalid_provider_response");
  }

  const session = isRecord(payload) && isRecord(payload.session) ? payload.session : null;
  const transport = isRecord(payload) && isRecord(payload.transport) ? payload.transport : null;
  const liveSessionId = session && typeof session.id === "string" ? session.id.trim() : "";
  const answerSdp = transport && typeof transport.sdp === "string" ? transport.sdp : "";

  if (!liveSessionId || !answerSdp.startsWith("v=0")) {
    throw new OpenAiLiveError("invalid_provider_response");
  }

  return { liveSessionId, answerSdp };
}

export interface HangupLiveSessionInput extends TransportOptions {
  liveSessionId: string;
}

/** REST `hangup`: 200 = zamknięta teraz, 404 = już nie istniała (spike S7). */
export async function hangupLiveSession(input: HangupLiveSessionInput): Promise<"closed" | "already_closed"> {
  const response = await postJson(`/${encodeURIComponent(input.liveSessionId)}/hangup`, undefined, input);
  await response.body?.cancel();

  if (response.ok) {
    return "closed";
  }

  if (response.status === 404) {
    return "already_closed";
  }

  throw new OpenAiLiveError(mapStatus(response.status));
}

export type LiveSidebandCommand =
  | { type: "session.instructions.append" | "session.commentary.append" | "session.thinking.append"; content: string }
  | { type: "session.input_audio.mute" | "session.input_audio.unmute" | "session.close" };

/** Minimum wspólne dla `WebSocket` Workers (po `accept()`) i atrap w testach. */
export interface SidebandSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: (event: unknown) => void): void;
}

export type SidebandConnector = (url: string, headers: Record<string, string>) => Promise<SidebandSocketLike>;

export interface LiveSideband {
  /** Wysyła komendę i czeka na potwierdzenie z tym samym `client_event_id` (albo `session.closed` dla `session.close`). */
  send(command: LiveSidebandCommand, options?: { timeoutMs?: number }): Promise<"acknowledged" | "unacknowledged">;
  onEvent(listener: (raw: string) => void): void;
  onClose(listener: () => void): void;
  close(): void;
  readonly open: boolean;
}

export interface OpenLiveSidebandInput {
  apiKey: string;
  liveSessionId: string;
  connect?: SidebandConnector;
}

/**
 * Domyślne połączenie z Workera: `fetch` z `Upgrade: websocket` i
 * `response.webSocket.accept()`. Attach wymaga samego `Authorization`;
 * nagłówek alfa daje 400 `observer_protocol_mismatch` (spike S8).
 */
export const connectSidebandFromWorker: SidebandConnector = async (url, headers) => {
  const response = await fetch(url.replace(/^wss:/, "https:"), { headers: { ...headers, Upgrade: "websocket" } });
  const socket = (response as Response & { webSocket?: (SidebandSocketLike & { accept(): void }) | null }).webSocket;

  if (!socket) {
    await response.body?.cancel();
    throw new OpenAiLiveError(mapStatus(response.status));
  }

  socket.accept();
  return socket;
};

let sidebandEventCounter = 0;

function nextEventId() {
  sidebandEventCounter += 1;
  return `sb_${Date.now().toString(36)}_${sidebandEventCounter.toString(36)}`;
}

export async function openLiveSideband(input: OpenLiveSidebandInput): Promise<LiveSideband> {
  const key = requireKey(input.apiKey);
  const connect = input.connect ?? connectSidebandFromWorker;
  const url = `${OPENAI_LIVE_ATTACH_URL}/${encodeURIComponent(input.liveSessionId)}/attach`;
  let socket: SidebandSocketLike;

  try {
    socket = await connect(url, { Authorization: `Bearer ${key}` });
  } catch (error) {
    if (error instanceof OpenAiLiveError) {
      throw error;
    }

    throw new OpenAiLiveError("provider_unavailable");
  }

  const eventListeners: ((raw: string) => void)[] = [];
  const closeListeners: (() => void)[] = [];
  const pending = new Map<string, { resolve: (value: "acknowledged") => void; reject: (error: Error) => void }>();
  let closePending: { resolve: (value: "acknowledged") => void } | null = null;
  let open = true;

  const handleClosed = () => {
    if (!open) {
      return;
    }

    open = false;

    for (const entry of pending.values()) {
      entry.reject(new OpenAiLiveError("provider_unavailable"));
    }

    pending.clear();

    for (const listener of closeListeners) {
      listener();
    }
  };

  socket.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : null;

    if (raw === null) {
      return;
    }

    const parsed = parseVoiceLiveEvent(raw);

    if (parsed.kind === "acknowledged" && parsed.clientEventId) {
      pending.get(parsed.clientEventId)?.resolve("acknowledged");
      pending.delete(parsed.clientEventId);
    } else if (parsed.kind === "error" && parsed.clientEventId) {
      pending.get(parsed.clientEventId)?.reject(new OpenAiLiveError("invalid_provider_response"));
      pending.delete(parsed.clientEventId);
    } else if (parsed.kind === "session_closed" && closePending) {
      closePending.resolve("acknowledged");
      closePending = null;
    }

    for (const listener of eventListeners) {
      listener(raw);
    }
  });
  socket.addEventListener("close", handleClosed);
  socket.addEventListener("error", handleClosed);

  return {
    get open() {
      return open;
    },
    onEvent(listener) {
      eventListeners.push(listener);
    },
    onClose(listener) {
      closeListeners.push(listener);
    },
    close() {
      try {
        socket.close(1000, "observer_done");
      } catch {
        /* already closed */
      }

      handleClosed();
    },
    send(command, options = {}) {
      if (!open) {
        return Promise.reject(new OpenAiLiveError("provider_unavailable"));
      }

      const eventId = nextEventId();
      const timeoutMs = options.timeoutMs ?? VOICE_SIDEBAND_ACK_TIMEOUT_MS;
      const payload =
        "content" in command
          ? { type: command.type, event_id: eventId, delegation_id: null, content: command.content }
          : { type: command.type, event_id: eventId };

      return new Promise<"acknowledged" | "unacknowledged">((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(eventId);
          closePending = null;
          resolve("unacknowledged");
        }, timeoutMs);
        const settle = {
          resolve: (value: "acknowledged") => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error: Error) => {
            clearTimeout(timer);
            reject(error);
          },
        };

        if (command.type === "session.close") {
          closePending = settle;
        } else {
          pending.set(eventId, settle);
        }

        try {
          socket.send(JSON.stringify(payload));
        } catch {
          settle.reject(new OpenAiLiveError("provider_unavailable"));
        }
      });
    },
  };
}
