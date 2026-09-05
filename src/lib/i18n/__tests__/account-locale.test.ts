import { describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE_NAME } from "../locale";
import { readAccountLocale, syncLocaleAfterSignIn, writeAccountLocale } from "../account-locale";

function repositoryWith(row: { locale: unknown } | null, options: { readError?: unknown; writeError?: unknown } = {}) {
  const maybeSingle = vi.fn(() => Promise.resolve({ data: row, error: options.readError ?? null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn(() => Promise.resolve({ error: options.writeError ?? null }));
  const from = vi.fn(() => ({ select, upsert }));

  return { repository: { from } as never, from, select, eq, upsert };
}

function cookiesWith(value: string | undefined) {
  const set = vi.fn();
  const get = vi.fn((name: string) => (name === LOCALE_COOKIE_NAME && value ? { value } : undefined));

  return { cookies: { get, set } as never, set };
}

describe("account locale", () => {
  it("reads only a valid stored locale", async () => {
    expect(await readAccountLocale(repositoryWith({ locale: "pl" }).repository, "u1")).toBe("pl");
    expect(await readAccountLocale(repositoryWith({ locale: "xx" }).repository, "u1")).toBeNull();
    expect(await readAccountLocale(repositoryWith(null).repository, "u1")).toBeNull();
    expect(await readAccountLocale(repositoryWith({ locale: "pl" }, { readError: {} }).repository, "u1")).toBeNull();
  });

  it("upserts keyed by user", async () => {
    const stub = repositoryWith(null);

    expect(await writeAccountLocale(stub.repository, "u1", "pl")).toBe(true);
    expect(stub.from).toHaveBeenCalledWith("user_preferences");
    expect(stub.upsert).toHaveBeenCalledWith({ user_id: "u1", locale: "pl" }, { onConflict: "user_id" });
    expect(await writeAccountLocale(repositoryWith(null, { writeError: {} }).repository, "u1", "pl")).toBe(false);
  });

  describe("syncLocaleAfterSignIn", () => {
    it("lets the account row win and refreshes the cookie", async () => {
      const stub = repositoryWith({ locale: "pl" });
      const { cookies, set } = cookiesWith("en");

      await syncLocaleAfterSignIn({ cookies }, stub.repository, { id: "u1" });

      expect(set).toHaveBeenCalledWith(LOCALE_COOKIE_NAME, "pl", expect.objectContaining({ path: "/" }));
      expect(stub.upsert).not.toHaveBeenCalled();
    });

    it("does not rewrite a cookie that already matches the account", async () => {
      const stub = repositoryWith({ locale: "pl" });
      const { cookies, set } = cookiesWith("pl");

      await syncLocaleAfterSignIn({ cookies }, stub.repository, { id: "u1" });

      expect(set).not.toHaveBeenCalled();
    });

    it("adopts an explicit cookie choice when the account has none", async () => {
      const stub = repositoryWith(null);
      const { cookies, set } = cookiesWith("pl");

      await syncLocaleAfterSignIn({ cookies }, stub.repository, { id: "u1" });

      expect(stub.upsert).toHaveBeenCalledWith({ user_id: "u1", locale: "pl" }, { onConflict: "user_id" });
      expect(set).not.toHaveBeenCalled();
    });

    it("never persists the implicit default", async () => {
      const stub = repositoryWith(null);
      const { cookies, set } = cookiesWith(undefined);

      await syncLocaleAfterSignIn({ cookies }, stub.repository, { id: "u1" });

      expect(stub.upsert).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it("never rejects, even when the query throws", async () => {
      const from = vi.fn(() => {
        throw new Error("network");
      });
      const { cookies } = cookiesWith("pl");

      await expect(syncLocaleAfterSignIn({ cookies }, { from } as never, { id: "u1" })).resolves.toBeUndefined();
    });
  });
});
