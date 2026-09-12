import { describe, expect, it, vi } from "vitest";
import {
  OpenAiLiveError,
  createLiveSession,
  hangupLiveSession,
  openLiveSideband,
  type LiveSessionConfig,
  type SidebandSocketLike,
} from "../live";

const KEY = "sk-live-test-key";
const SESSION: LiveSessionConfig = {
  model: "gpt-live-1",
  store: false,
  instructions: "Mów po polsku.",
  audio: { output: { voice: "marin" } },
  delegation: {
    type: "responses",
    responses: { model: "gpt-5.6-luna", instructions: "Krótko.", reasoning: { effort: "low" }, max_output_tokens: 400 },
  },
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createLiveSession", () => {
  it("posts the session config with the WebRTC offer and returns the id and answer", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(201, { session: { id: "live_u2_abc" }, transport: { type: "webrtc", sdp: "v=0\r\na=answer" } }),
      );

    await expect(createLiveSession({ apiKey: KEY, sdp: "v=0\r\na=offer", session: SESSION, fetcher })).resolves.toEqual(
      {
        liveSessionId: "live_u2_abc",
        answerSdp: "v=0\r\na=answer",
      },
    );
    const request = fetcher.mock.calls[0][0] as Request;
    expect(request.url).toBe("https://api.openai.com/v1/live/sessions");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("manual");
    expect(request.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    await expect(request.json()).resolves.toEqual({
      session: SESSION,
      transport: { type: "webrtc", sdp: "v=0\r\na=offer" },
    });
  });

  it("refuses an OpenRouter key before touching the network", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createLiveSession({ apiKey: "sk-or-nope", sdp: "v=0", session: SESSION, fetcher }),
    ).rejects.toMatchObject({
      category: "missing_configuration",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps provider statuses to closed categories and never keeps the error body", async () => {
    for (const [status, category] of [
      [400, "invalid_provider_response"],
      [422, "invalid_provider_response"],
      [429, "provider_rate_limited"],
      [504, "provider_timeout"],
      [500, "provider_unavailable"],
    ] as const) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(status, { error: { message: "private upstream details" } }));
      const error = await createLiveSession({ apiKey: KEY, sdp: "v=0", session: SESSION, fetcher }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(OpenAiLiveError);
      expect((error as OpenAiLiveError).category).toBe(category);
      expect(JSON.stringify(error)).not.toContain("private upstream details");
    }
  });

  it("treats a malformed payload and an aborted request as provider failures", async () => {
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(201, { session: {}, transport: { sdp: "nope" } }));
    await expect(
      createLiveSession({ apiKey: KEY, sdp: "v=0", session: SESSION, fetcher: malformed }),
    ).rejects.toMatchObject({
      category: "invalid_provider_response",
    });

    const slow = vi.fn<typeof fetch>(
      (input) =>
        new Promise<Response>((_resolve, reject) => {
          (input as Request).signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );
    await expect(
      createLiveSession({
        apiKey: KEY,
        sdp: "v=0",
        session: SESSION,
        fetcher: slow,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ category: "provider_timeout" });
  });
});

describe("hangupLiveSession", () => {
  it("distinguishes a closed session from one that was already gone", async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    await expect(hangupLiveSession({ apiKey: KEY, liveSessionId: "live_1", fetcher: ok })).resolves.toBe("closed");
    expect((ok.mock.calls[0][0] as Request).url).toBe("https://api.openai.com/v1/live/sessions/live_1/hangup");

    const gone = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(404, { error: { code: "session_id_not_found" } }));
    await expect(hangupLiveSession({ apiKey: KEY, liveSessionId: "live_1", fetcher: gone })).resolves.toBe(
      "already_closed",
    );

    const down = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 }));
    await expect(hangupLiveSession({ apiKey: KEY, liveSessionId: "live_1", fetcher: down })).rejects.toMatchObject({
      category: "provider_unavailable",
    });
  });
});

describe("openLiveSideband", () => {
  function createFakeSocket() {
    const listeners: Record<string, ((event: never) => void)[]> = { message: [], close: [], error: [] };
    const socket: SidebandSocketLike & { sent: string[]; emit(payload: unknown): void; drop(): void } = {
      sent: [],
      send: (data) => {
        socket.sent.push(data);
      },
      close: vi.fn(),
      addEventListener: (type: string, listener: (event: never) => void) => {
        listeners[type].push(listener);
      },
      emit: (payload) => {
        listeners.message.forEach((listener) => {
          listener({ data: JSON.stringify(payload) } as never);
        });
      },
      drop: () => {
        listeners.close.forEach((listener) => {
          listener({} as never);
        });
      },
    };
    return socket;
  }

  it("attaches with the bearer key only and resolves commands on their acknowledgement", async () => {
    const socket = createFakeSocket();
    const connect = vi.fn(() => Promise.resolve(socket));
    const sideband = await openLiveSideband({ apiKey: KEY, liveSessionId: "live_1", connect });

    expect(connect).toHaveBeenCalledWith("wss://api.openai.com/v1/live/sessions/live_1/attach", {
      Authorization: `Bearer ${KEY}`,
    });
    const pending = sideband.send({ type: "session.instructions.append", content: "Pauza." });
    const sent = JSON.parse(socket.sent[0]) as { type: string; event_id: string; delegation_id: null; content: string };
    expect(sent).toMatchObject({ type: "session.instructions.append", delegation_id: null, content: "Pauza." });
    socket.emit({ type: "session.instructions.appended", client_event_id: sent.event_id });
    await expect(pending).resolves.toBe("acknowledged");

    const mute = sideband.send({ type: "session.input_audio.mute" });
    const muteSent = JSON.parse(socket.sent[1]) as { event_id: string };
    socket.emit({ type: "session.input_audio.muted", client_event_id: muteSent.event_id });
    await expect(mute).resolves.toBe("acknowledged");
  });

  it("resolves session.close on session.closed, rejects on a matching error and times out otherwise", async () => {
    const socket = createFakeSocket();
    const sideband = await openLiveSideband({
      apiKey: KEY,
      liveSessionId: "live_1",
      connect: () => Promise.resolve(socket),
    });

    const failing = sideband.send({ type: "session.thinking.append", content: "x" });
    const failingSent = JSON.parse(socket.sent[0]) as { event_id: string };
    socket.emit({
      type: "error",
      error: { code: "context_injection_incomplete", client_event_id: failingSent.event_id },
    });
    await expect(failing).rejects.toMatchObject({ category: "invalid_provider_response" });

    await expect(sideband.send({ type: "session.commentary.append", content: "y" }, { timeoutMs: 5 })).resolves.toBe(
      "unacknowledged",
    );

    const closing = sideband.send({ type: "session.close" });
    socket.emit({ type: "session.closed", reason: "close_requested", usage: { seconds: 3 } });
    await expect(closing).resolves.toBe("acknowledged");
  });

  it("forwards raw events, reports the socket closing and refuses to send afterwards", async () => {
    const socket = createFakeSocket();
    const sideband = await openLiveSideband({
      apiKey: KEY,
      liveSessionId: "live_1",
      connect: () => Promise.resolve(socket),
    });
    const events: string[] = [];
    const closed = vi.fn();
    sideband.onEvent((raw) => events.push(raw));
    sideband.onClose(closed);

    socket.emit({ type: "session.input_transcript.delta", delta: "hej", start_ms: 0, end_ms: 200 });
    expect(events).toHaveLength(1);
    expect(sideband.open).toBe(true);
    socket.drop();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(sideband.open).toBe(false);
    await expect(sideband.send({ type: "session.close" })).rejects.toMatchObject({ category: "provider_unavailable" });
  });
});
