import { describe, expect, it } from "vitest";
import { SESSION_AI_ERROR_CATEGORIES } from "../errors";
import { getSessionAiFailureCopy } from "../session-response-copy";

describe("getSessionAiFailureCopy", () => {
  it("provides stable Polish retry copy for every ordinary AI failure category", () => {
    for (const category of SESSION_AI_ERROR_CATEGORIES) {
      const copy = getSessionAiFailureCopy(category);

      expect(copy.title).not.toContain("OpenRouter");
      expect(copy.body).not.toContain("payload");
      expect(copy.retryLabel).toBe("Spróbuj ponownie");
    }
  });
});
