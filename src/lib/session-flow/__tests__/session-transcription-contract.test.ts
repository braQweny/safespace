import { describe, expect, it } from "vitest";
import {
  getBase64DecodedByteLength,
  isSessionTranscriptionFailure,
  isSessionTranscriptionSuccess,
  parseSessionTranscriptionRequest,
  SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES,
} from "../session-transcription-contract";

function createRequest(body: unknown) {
  return new Request("https://safespace.local/api/session/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("session transcription contract", () => {
  const sessionId = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";

  it("accepts only raw webm base64 audio", async () => {
    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
          sessionId,
          audioBase64: "UklGRg==",
          format: "webm",
        }),
      ),
    ).resolves.toEqual({
      ok: true,
      data: {
        sessionId,
        audioBase64: "UklGRg==",
        format: "webm",
      },
    });

    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
          sessionId,
          audioBase64: "UklGRg==",
          format: "mp3",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "unsupported_format",
      status: 400,
    });

    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
          sessionId,
          audioBase64: "data:audio/webm;base64,UklGRg==",
          format: "webm",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "invalid_audio",
      status: 400,
    });
  });

  it("rejects audio above the server-side decoded byte cap", async () => {
    const oversizedAudio = "A".repeat(Math.ceil(((SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES + 1) * 4) / 3));

    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
          sessionId,
          audioBase64: oversizedAudio,
          format: "webm",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "audio_too_large",
      status: 413,
    });
  });

  it("rejects a missing or malformed session id before accepting audio", async () => {
    await expect(
      parseSessionTranscriptionRequest(createRequest({ audioBase64: "UklGRg==", format: "webm" })),
    ).resolves.toEqual({
      ok: false,
      code: "session_not_found",
      status: 404,
    });
  });

  it("narrows stable response shapes", () => {
    expect(isSessionTranscriptionSuccess({ ok: true, type: "session_transcription", text: "tekst" })).toBe(true);
    expect(
      isSessionTranscriptionFailure({ ok: false, type: "session_transcription_error", code: "provider_unavailable" }),
    ).toBe(true);
    expect(getBase64DecodedByteLength("UklGRg==")).toBe(4);
    expect(getBase64DecodedByteLength("not base64")).toBeNull();
  });
});
