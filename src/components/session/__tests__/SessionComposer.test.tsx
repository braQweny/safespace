import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSessionCopy } from "@/lib/session-copy";
import SessionComposer, {
  appendTranscriptionToDraft,
  formatRecordingProgress,
  getDictationErrorCopy,
  getDictationSupport,
  getSupportedWebmMimeType,
  readCoarsePointerPreference,
  shouldHintSubmitShortcut,
  shouldSubmitSessionComposerFromKeyboard,
} from "../SessionComposer";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const SESSION_ID = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const DICTATION_COPY = getSessionCopy("pl").dictation;

function keyboardEvent(
  overrides: Partial<Parameters<typeof shouldSubmitSessionComposerFromKeyboard>[0]> = {},
): Parameters<typeof shouldSubmitSessionComposerFromKeyboard>[0] {
  return {
    altKey: false,
    ctrlKey: false,
    key: "Enter",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

function renderComposer(props: Partial<Parameters<typeof SessionComposer>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionComposer
      sessionId={SESSION_ID}
      value=""
      isDisabled={false}
      isPending={false}
      onChange={() => undefined}
      onSubmit={() => undefined}
      {...props}
    />,
  );
}

function getTextareaTag(html: string) {
  const match = /<textarea[^>]*>/.exec(html);

  if (!match) {
    throw new Error("textarea not rendered");
  }

  return match[0];
}

describe("SessionComposer keyboard submit shortcut", () => {
  it("submits with Ctrl+Enter on Windows and Linux platforms", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "Win32")).toBe(true);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "Linux x86_64")).toBe(true);
  });

  it("submits with Cmd+Enter and Ctrl+Enter on macOS platforms", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ metaKey: true }), "MacIntel")).toBe(true);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ ctrlKey: true }), "MacIntel")).toBe(true);
  });

  it("keeps plain Enter and Shift+Enter as textarea input", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent(), "Win32")).toBe(false);
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ shiftKey: true }), "MacIntel")).toBe(false);
  });

  it("does not submit with the Windows key on non-mac platforms", () => {
    expect(shouldSubmitSessionComposerFromKeyboard(keyboardEvent({ metaKey: true }), "Win32")).toBe(false);
  });
});

/*
 * Wyłączony `textarea` gubi fokus, więc po każdej turze rozmowa na klawiaturze
 * zaczynała się od szukania pola. W trakcie tury pole jest tylko do odczytu i
 * ogłasza zajętość; wyłączone zostaje wyłącznie wtedy, gdy rozmowa się skończyła.
 */
describe("SessionComposer field state", () => {
  it("keeps the field focusable while a turn is pending", () => {
    const textarea = getTextareaTag(renderComposer({ isPending: true }));

    expect(textarea).toMatch(/readonly=""/i);
    expect(textarea).toContain('aria-busy="true"');
    expect(textarea).not.toContain('disabled=""');
  });

  it("disables the field only when the composer itself is unavailable", () => {
    const textarea = getTextareaTag(renderComposer({ isDisabled: true }));

    expect(textarea).toContain('disabled=""');
    expect(textarea).not.toMatch(/readonly=""/i);
    expect(textarea).not.toContain("aria-busy");
  });

  it("renders an open, editable field for an active conversation", () => {
    const textarea = getTextareaTag(renderComposer());

    expect(textarea).not.toContain('disabled=""');
    expect(textarea).not.toMatch(/readonly=""/i);
  });

  it("blocks sending while a turn is pending", () => {
    const html = renderComposer({ isPending: true, value: "gotowa wiadomość" });
    const submitButton = /<button type="submit"[^>]*>/.exec(html)?.[0] ?? "";

    expect(submitButton).toContain('disabled=""');
  });
});

describe("SessionComposer dictation controls", () => {
  it("does not promise dictation before the browser confirms support", () => {
    // SSR i hydratacja nie wiedzą, czy jest nagrywarka i WebM — przycisk
    // pojawia się dopiero po potwierdzeniu, nie znika po odmowie.
    const html = renderComposer();

    expect(html).not.toContain("Dyktuj");
    expect(html).toContain("Wyślij");
  });

  it("appends transcriptions to the current draft without submitting", () => {
    expect(appendTranscriptionToDraft("Mam myśl", "którą chcę dopisać.")).toEqual({
      value: "Mam myśl którą chcę dopisać.",
      didAppend: true,
      wasTruncated: false,
    });
    expect(appendTranscriptionToDraft("", "  Nowa wiadomość.  ")).toEqual({
      value: "Nowa wiadomość.",
      didAppend: true,
      wasTruncated: false,
    });
  });

  it("detects WebM MediaRecorder support for v1 dictation", () => {
    expect(
      getSupportedWebmMimeType({
        isTypeSupported: (mimeType) => mimeType === "audio/webm;codecs=opus",
      }),
    ).toBe("audio/webm;codecs=opus");
    expect(
      getSupportedWebmMimeType({
        isTypeSupported: () => false,
      }),
    ).toBeNull();
  });

  it("requires a recorder, a microphone API and a WebM codec to offer dictation", () => {
    const webmRecorder = { isTypeSupported: (mimeType: string) => mimeType.startsWith("audio/webm") };
    const mp4OnlyRecorder = { isTypeSupported: (mimeType: string) => mimeType === "audio/mp4" };
    const mediaDevices = { getUserMedia: () => Promise.reject(new Error("unused")) };

    expect(getDictationSupport({ mediaRecorder: webmRecorder, mediaDevices })).toBe(true);
    // Safari na iOS: nagrywarka jest, WebM nie.
    expect(getDictationSupport({ mediaRecorder: mp4OnlyRecorder, mediaDevices })).toBe(false);
    expect(getDictationSupport({ mediaRecorder: undefined, mediaDevices })).toBe(false);
    expect(getDictationSupport({ mediaRecorder: webmRecorder, mediaDevices: undefined })).toBe(false);
  });

  it("names what went wrong with the microphone", () => {
    expect(getDictationErrorCopy("pl", new DOMException("denied", "NotAllowedError"))).toBe(
      DICTATION_COPY.microphoneDenied,
    );
    expect(getDictationErrorCopy("pl", new DOMException("insecure", "SecurityError"))).toBe(
      DICTATION_COPY.microphoneDenied,
    );
    expect(getDictationErrorCopy("pl", new DOMException("none", "NotFoundError"))).toBe(
      DICTATION_COPY.microphoneMissing,
    );
    expect(getDictationErrorCopy("pl", { name: "NotFoundError" })).toBe(DICTATION_COPY.microphoneMissing);
    expect(getDictationErrorCopy("pl", new Error("busy"))).toBe(DICTATION_COPY.microphoneUnavailable);
    expect(getDictationErrorCopy("pl", undefined)).toBe(DICTATION_COPY.microphoneUnavailable);
  });

  it("shows recording progress against the limit", () => {
    expect(formatRecordingProgress("pl", 0)).toBe("Nagrywanie… 0 s / 60 s");
    expect(formatRecordingProgress("pl", 12.9)).toBe("Nagrywanie… 12 s / 60 s");
    expect(formatRecordingProgress("pl", 75)).toBe("Nagrywanie… 60 s / 60 s");
    expect(formatRecordingProgress("pl", 5, 30_000)).toBe("Nagrywanie… 5 s / 30 s");
    expect(formatRecordingProgress("en", 5, 30_000)).toBe("Recording… 5 s / 30 s");
  });
});

/*
 * Enter nie wysyła i nie ma wysyłać — w rozmowie, do której wraca się w połowie
 * zdania, wysłanie w pół myśli jest gorsze niż jedno nieudane naciśnięcie. Ale
 * odruch z komunikatorów jest silny, więc dokładnie w tym naciśnięciu podpowiedź
 * o skrócie ma się zapalić zamiast siedzieć szarym drobnym drukiem.
 */
describe("shouldHintSubmitShortcut", () => {
  it("lights the hint on a bare Enter with something written", () => {
    expect(shouldHintSubmitShortcut(keyboardEvent(), true)).toBe(true);
  });

  it("stays quiet when the field is empty", () => {
    expect(shouldHintSubmitShortcut(keyboardEvent(), false)).toBe(false);
  });

  it("stays quiet on a deliberate new line", () => {
    expect(shouldHintSubmitShortcut(keyboardEvent({ shiftKey: true }), true)).toBe(false);
  });

  it("stays quiet while the message is actually being sent", () => {
    expect(shouldHintSubmitShortcut(keyboardEvent({ metaKey: true }), true)).toBe(false);
    expect(shouldHintSubmitShortcut(keyboardEvent({ ctrlKey: true }), true)).toBe(false);
  });

  it("ignores other keys", () => {
    expect(shouldHintSubmitShortcut(keyboardEvent({ key: "a" }), true)).toBe(false);
  });
});

describe("keyboard shortcut hint on touch screens", () => {
  it("reads the coarse-pointer preference from matchMedia", () => {
    expect(readCoarsePointerPreference((query) => ({ matches: query === "(pointer: coarse)" }))).toBe(true);
    expect(readCoarsePointerPreference(() => ({ matches: false }))).toBe(false);
    expect(readCoarsePointerPreference(undefined)).toBe(false);
  });

  it("keeps the hint in server markup, where the pointer is still unknown", () => {
    expect(renderComposer()).toContain("Cmd/Ctrl + Enter wysyła");
  });
});
