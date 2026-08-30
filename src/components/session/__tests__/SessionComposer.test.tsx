import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionComposer, {
  appendTranscriptionToDraft,
  getSupportedWebmMimeType,
  shouldHintSubmitShortcut,
  shouldSubmitSessionComposerFromKeyboard,
} from "../SessionComposer";

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

describe("SessionComposer dictation controls", () => {
  it("renders a microphone action next to the send action", () => {
    const html = renderToStaticMarkup(
      <SessionComposer
        sessionId="5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a"
        value=""
        isDisabled={false}
        isPending={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(html).toContain("Dyktuj");
    expect(html).toContain("Wyślij");
  });

  it("disables dictation when the composer is disabled or message is pending", () => {
    const disabledHtml = renderToStaticMarkup(
      <SessionComposer
        sessionId="5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a"
        value=""
        isDisabled={true}
        isPending={false}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const pendingHtml = renderToStaticMarkup(
      <SessionComposer
        sessionId="5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a"
        value=""
        isDisabled={false}
        isPending={true}
        onChange={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(disabledHtml).toContain('disabled=""');
    expect(pendingHtml).toContain('disabled=""');
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
