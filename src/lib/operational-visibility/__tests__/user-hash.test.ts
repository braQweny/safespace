import { describe, expect, it } from "vitest";
import { hashOperationalUserId } from "../user-hash";

describe("hashOperationalUserId", () => {
  it("returns a stable pseudonymous hash with a secret", async () => {
    const first = await hashOperationalUserId("user-123", "test-secret");
    const second = await hashOperationalUserId("user-123", "test-secret");

    expect(first).toBe(second);
    expect(first).toMatch(/^usr_[a-f0-9]{32}$/);
    expect(first).not.toContain("user-123");
  });

  it("changes when the secret changes", async () => {
    const first = await hashOperationalUserId("user-123", "test-secret");
    const second = await hashOperationalUserId("user-123", "other-secret");

    expect(first).not.toBe(second);
  });

  it("returns null without usable input or secret", async () => {
    await expect(hashOperationalUserId("user-123", "")).resolves.toBeNull();
    await expect(hashOperationalUserId("", "test-secret")).resolves.toBeNull();
    await expect(hashOperationalUserId(null, "test-secret")).resolves.toBeNull();
  });
});
