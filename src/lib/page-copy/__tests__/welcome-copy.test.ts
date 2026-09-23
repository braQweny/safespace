import { describe, expect, it } from "vitest";
import { getWelcomeCopy } from "../welcome-copy";

describe("welcome copy", () => {
  it("calls the preview a conversation, never a session", () => {
    // Na ekranie rozmowa jest zawsze rozmową; „sesja” zostaje w kodzie i API.
    expect(getWelcomeCopy("en").previewAria("Lena")).not.toMatch(/session/i);
    expect(getWelcomeCopy("en").previewAria("Lena")).toContain("conversation time");
    expect(getWelcomeCopy("pl").previewAria("Lena")).not.toMatch(/sesj/i);
    expect(getWelcomeCopy("pl").previewAria("Lena")).toContain("czas rozmowy");
  });
});
