import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));

describe("account page: voice allowance", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");

  it("reads the voice pool only while the feature is available and renders one sentence under the plan", () => {
    expect(page).toContain("const voiceStartAvailable = isVoiceStartAvailable();");
    expect(page).toContain(
      "voiceStartAvailable ? readVoiceQuota(sessionContext.data, { limitMinutes: getVoiceMonthlyMinutes() }) : null",
    );
    expect(page).toContain("voiceQuota = voiceQuotaResult?.ok ? voiceQuotaResult.data : null;");
    expect(page).toContain("data-account-voice");
    expect(page).toContain("{formatVoiceAllowance(locale, voiceQuota)}");
    // Bez puli (flaga off, odczyt padł) akapit znika; plan i pula tekstowa zostają.
    expect(page).toMatch(/\{voiceQuota \? \(\s*<p class="[^"]*" data-account-voice>/);
  });
});
