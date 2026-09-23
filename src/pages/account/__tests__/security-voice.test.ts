import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));

describe("account page: voice allowance", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");

  it("reads the voice pool only while the feature is available and renders it as one row under the plan", () => {
    expect(page).toContain("const voiceStartAvailable = isVoiceStartAvailable();");
    expect(page).toContain(
      "voiceStartAvailable ? readVoiceQuota(sessionContext.data, { limitMinutes: getVoiceMonthlyMinutes() }) : null",
    );
    expect(page).toContain("voiceQuota = voiceQuotaResult?.ok ? voiceQuotaResult.data : null;");
    // Wiersze planu składa jeden formatter; bez puli (flaga off, odczyt padł)
    // wiersz głosowy znika, plan i pula tekstowa zostają (testy formattera).
    expect(page).toContain("formatAccountPlanRows(locale, quota, voiceQuota)");
    expect(page).toContain("data-account-plan-row={row.kind}");
    expect(page).not.toContain("formatVoiceAllowance");
  });
});
