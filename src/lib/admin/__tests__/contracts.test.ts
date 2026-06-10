import { describe, expect, it } from "vitest";
import {
  adminApiFailure,
  isAdminApiFailure,
  isAdminUserBlockSuccess,
  isAdminUsersSuccess,
} from "@/lib/admin/contracts";

const nonResponses: unknown[] = [null, undefined, "ok", 42, [], { ok: true }, { ok: false }];

describe("admin api response guards", () => {
  it("accepts only the matching success discriminants", () => {
    expect(isAdminUsersSuccess({ ok: true, type: "admin_users", result: {} })).toBe(true);
    expect(isAdminUserBlockSuccess({ ok: true, type: "admin_user_block", result: {} })).toBe(true);

    expect(isAdminUsersSuccess({ ok: true, type: "admin_user_block" })).toBe(false);
    expect(isAdminUserBlockSuccess({ ok: false, type: "admin_user_block" })).toBe(false);

    for (const value of nonResponses) {
      expect(isAdminUsersSuccess(value)).toBe(false);
      expect(isAdminUserBlockSuccess(value)).toBe(false);
    }
  });

  it("recognizes contract failure responses", () => {
    expect(isAdminApiFailure(adminApiFailure("write_failed"))).toBe(true);
    expect(isAdminApiFailure({ ok: false, type: "admin_error" })).toBe(false);

    for (const value of nonResponses) {
      expect(isAdminApiFailure(value)).toBe(false);
    }
  });
});
