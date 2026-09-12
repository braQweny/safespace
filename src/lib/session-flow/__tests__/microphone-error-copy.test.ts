import { describe, expect, it } from "vitest";
import { getSessionCopy } from "@/lib/session-copy";
import { getErrorName, getMicrophoneErrorCopy, getMicrophoneErrorKind } from "../microphone-error-copy";
import { readVoiceSupport } from "../voice-support";

function domError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe("microphone error copy", () => {
  it("reads the exception name from errors and error-like objects", () => {
    expect(getErrorName(domError("NotAllowedError"))).toBe("NotAllowedError");
    expect(getErrorName({ name: "NotFoundError" })).toBe("NotFoundError");
    expect(getErrorName("nope")).toBe("");
    expect(getErrorName(null)).toBe("");
  });

  it("maps denied, missing and everything else, in both languages", () => {
    expect(getMicrophoneErrorKind(domError("NotAllowedError"))).toBe("denied");
    expect(getMicrophoneErrorKind(domError("SecurityError"))).toBe("denied");
    expect(getMicrophoneErrorKind(domError("PermissionDeniedError"))).toBe("denied");
    expect(getMicrophoneErrorKind(domError("NotFoundError"))).toBe("missing");
    expect(getMicrophoneErrorKind(domError("OverconstrainedError"))).toBe("missing");
    expect(getMicrophoneErrorKind(domError("NotReadableError"))).toBe("unavailable");
    expect(getMicrophoneErrorKind(undefined)).toBe("unavailable");

    for (const locale of ["pl", "en"] as const) {
      const { dictation } = getSessionCopy(locale);
      expect(getMicrophoneErrorCopy(locale, domError("NotAllowedError"))).toBe(dictation.microphoneDenied);
      expect(getMicrophoneErrorCopy(locale, domError("NotFoundError"))).toBe(dictation.microphoneMissing);
      expect(getMicrophoneErrorCopy(locale, new Error("boom"))).toBe(dictation.microphoneUnavailable);
    }
  });
});

describe("readVoiceSupport", () => {
  it("needs both a peer connection constructor and getUserMedia", () => {
    const getUserMedia = () => Promise.reject(new Error("unused"));
    expect(readVoiceSupport({ peerConnection: EventTarget, mediaDevices: { getUserMedia } })).toBe(true);
    expect(readVoiceSupport({ peerConnection: undefined, mediaDevices: { getUserMedia } })).toBe(false);
    expect(readVoiceSupport({ peerConnection: EventTarget, mediaDevices: undefined })).toBe(false);
    expect(readVoiceSupport({ peerConnection: {}, mediaDevices: { getUserMedia } })).toBe(false);
  });
});
