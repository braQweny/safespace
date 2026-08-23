import { describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({
  SUPPORT_EMAIL: "  pomoc@example.org ",
}));

import { DEFAULT_SUPPORT_EMAIL, getSupportContact, resolveSupportEmail, toSupportContact } from "@/lib/support-contact";

describe("support contact", () => {
  it("trims and validates the configured address", () => {
    expect(resolveSupportEmail(" pomoc@example.org ")).toBe("pomoc@example.org");
    expect(resolveSupportEmail("")).toBeNull();
    expect(resolveSupportEmail(undefined)).toBeNull();
    expect(resolveSupportEmail("nie-adres")).toBeNull();
  });

  it("prefers the configured address and falls back to the official mailbox", () => {
    expect(toSupportContact("pomoc@example.org")).toEqual({
      email: "pomoc@example.org",
      mailtoHref: "mailto:pomoc@example.org",
    });
    expect(DEFAULT_SUPPORT_EMAIL).toBe("safespacenow123@gmail.com");
    expect(toSupportContact(null)).toEqual({
      email: DEFAULT_SUPPORT_EMAIL,
      mailtoHref: `mailto:${DEFAULT_SUPPORT_EMAIL}`,
    });
    expect(toSupportContact("nie-adres").email).toBe(DEFAULT_SUPPORT_EMAIL);
  });

  it("reads the address from the environment", () => {
    expect(getSupportContact().email).toBe("pomoc@example.org");
  });
});
