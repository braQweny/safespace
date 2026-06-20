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
  it("accepts only raw webm base64 audio", async () => {
    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
          audioBase64: "UklGRg==",
          format: "webm",
        }),
      ),
    ).resolves.toEqual({
      ok: true,
      data: {
        audioBase64: "UklGRg==",
        format: "webm",
      },
    });

    await expect(
      parseSessionTranscriptionRequest(
        createRequest({
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

  it("narrows stable response shapes", () => {
    expect(isSessionTranscriptionSuccess({ ok: true, type: "session_transcription", text: "tekst" })).toBe(true);
    expect(
      isSessionTranscriptionFailure({ ok: false, type: "session_transcription_error", code: "provider_unavailable" }),
    ).toBe(true);
    expect(getBase64DecodedByteLength("UklGRg==")).toBe(4);
    expect(getBase64DecodedByteLength("not base64")).toBeNull();
  });
});
