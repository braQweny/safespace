import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SECURITY_PATH = fileURLToPath(new URL("../security.astro", import.meta.url));
const TOGGLE_PATH = fileURLToPath(new URL("../../../components/account/PeopleMemoryToggle.astro", import.meta.url));

describe("account page: people memory settings", () => {
  const page = readFileSync(SECURITY_PATH, "utf8");
  const toggle = readFileSync(TOGGLE_PATH, "utf8");

  it("keeps the delete-all form and the card visible whenever saved rows exist, even with the flag off", () => {
    expect(page).toContain("const showsPeopleCard = peopleMemoryMode || hasPeopleRows");
    expect(page).toContain('id="people-memory"');
    expect(page).toContain('action="/api/session/people/delete-all"');
    expect(page).toContain('<input type="checkbox" name="confirm" value="1" required');
    expect(page).toContain("peopleMemoryMode ? peopleCopy.intro : peopleCopy.modeOffIntro");
  });

  it("renders the toggle as a native form with a pressed state and no inline script", () => {
    expect(toggle).toContain('action="/api/profile/people-memory"');
    expect(toggle).toContain('name="enabled"');
    expect(toggle).toContain("aria-pressed={option.pressed}");
    expect(toggle).not.toContain("<script");
    expect(page).toContain("<PeopleMemoryToggle enabled={peopleMemoryEnabled} />");
  });

  it("reports the redirect status without trusting arbitrary query values", () => {
    expect(page).toContain("isPeopleSettingsStatusCode(peopleStatus) ? peopleCopy.status[peopleStatus] : null");
  });
});
