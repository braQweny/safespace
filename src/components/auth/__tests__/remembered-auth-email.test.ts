import { describe, expect, it, vi } from "vitest";
import {
  REMEMBERED_AUTH_EMAIL_KEY,
  bindRememberedAuthEmailForm,
  createRememberedAuthEmailReader,
  forgetRememberedAuthEmail,
  rememberAuthEmail,
  takeRememberedAuthEmail,
  type RememberedAuthEmailStorage,
} from "../remembered-auth-email";

function createMemoryStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));

  const storage: RememberedAuthEmailStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };

  return { storage, entries };
}

function createThrowingStorage(): RememberedAuthEmailStorage {
  return {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("storage disabled");
    },
    removeItem: () => {
      throw new Error("storage disabled");
    },
  };
}

interface FakeEmailForm {
  form: HTMLFormElement;
  input: { value: string };
  submit: () => void;
}

function createFakeEmailForm(initialValue = "", withInput = true): FakeEmailForm {
  const input = { value: initialValue };
  const listeners: (() => void)[] = [];

  const form = {
    querySelector: (selector: string) => (withInput && selector === 'input[name="email"]' ? input : null),
    addEventListener: (_type: string, listener: () => void) => {
      listeners.push(listener);
    },
  } as unknown as HTMLFormElement;

  return {
    form,
    input,
    submit: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe("rememberAuthEmail", () => {
  it("stores the trimmed address under the single shared key", () => {
    const { storage, entries } = createMemoryStorage();

    rememberAuthEmail("  user@example.com ", storage);

    expect(entries.get(REMEMBERED_AUTH_EMAIL_KEY)).toBe("user@example.com");
    expect(REMEMBERED_AUTH_EMAIL_KEY).toBe("safespace.auth.email");
  });

  it("clears the slot instead of storing an empty or oversized value", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "old@example.com" });

    rememberAuthEmail("   ", storage);
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);

    rememberAuthEmail("new@example.com", storage);
    rememberAuthEmail(`${"a".repeat(250)}@example.com`, storage);
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
  });

  it("swallows storage failures and does nothing without storage", () => {
    expect(() => {
      rememberAuthEmail("user@example.com", createThrowingStorage());
    }).not.toThrow();
    expect(() => {
      rememberAuthEmail("user@example.com", null);
    }).not.toThrow();
  });
});

describe("takeRememberedAuthEmail", () => {
  it("returns the remembered address once and removes it", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });

    expect(takeRememberedAuthEmail(storage)).toBe("user@example.com");
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
    expect(takeRememberedAuthEmail(storage)).toBeNull();
  });

  it("ignores junk values and still clears the slot", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "   " });

    expect(takeRememberedAuthEmail(storage)).toBeNull();
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
  });

  it("returns null when storage is missing or throws", () => {
    expect(takeRememberedAuthEmail(null)).toBeNull();
    expect(takeRememberedAuthEmail(createThrowingStorage())).toBeNull();
  });
});

describe("forgetRememberedAuthEmail", () => {
  it("removes the slot and tolerates broken storage", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });

    forgetRememberedAuthEmail(storage);
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);

    expect(() => {
      forgetRememberedAuthEmail(createThrowingStorage());
    }).not.toThrow();
    expect(() => {
      forgetRememberedAuthEmail(null);
    }).not.toThrow();
  });
});

describe("createRememberedAuthEmailReader", () => {
  it("takes the address on the first read and keeps answering with it afterwards", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });
    const read = createRememberedAuthEmailReader(storage);

    expect(read()).toBe("user@example.com");
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
    expect(read()).toBe("user@example.com");
  });

  it("caches an empty result as well, so a later write does not leak into an older reader", () => {
    const { storage } = createMemoryStorage();
    const read = createRememberedAuthEmailReader(storage);

    expect(read()).toBeNull();
    rememberAuthEmail("later@example.com", storage);
    expect(read()).toBeNull();
  });
});

describe("bindRememberedAuthEmailForm", () => {
  it("restores the remembered address into an empty e-mail input and consumes it", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });
    const fake = createFakeEmailForm();

    const remembered = bindRememberedAuthEmailForm(fake.form, { restore: true }, storage);

    expect(remembered).toBe("user@example.com");
    expect(fake.input.value).toBe("user@example.com");
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
  });

  it("never overwrites what the browser already put into the field", () => {
    const { storage } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "remembered@example.com" });
    const fake = createFakeEmailForm("typed@example.com");

    bindRememberedAuthEmailForm(fake.form, { restore: true }, storage);

    expect(fake.input.value).toBe("typed@example.com");
  });

  it("clears a leftover address instead of restoring it when restore is off", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });
    const fake = createFakeEmailForm();

    const remembered = bindRememberedAuthEmailForm(fake.form, { restore: false }, storage);

    expect(remembered).toBeNull();
    expect(fake.input.value).toBe("");
    expect(entries.has(REMEMBERED_AUTH_EMAIL_KEY)).toBe(false);
  });

  it("remembers the current field value when the form submits", () => {
    const { storage, entries } = createMemoryStorage();
    const fake = createFakeEmailForm();

    bindRememberedAuthEmailForm(fake.form, { restore: true }, storage);
    fake.input.value = " submitted@example.com ";
    fake.submit();

    expect(entries.get(REMEMBERED_AUTH_EMAIL_KEY)).toBe("submitted@example.com");
  });

  it("does nothing without an e-mail input", () => {
    const { storage, entries } = createMemoryStorage({ [REMEMBERED_AUTH_EMAIL_KEY]: "user@example.com" });
    const fake = createFakeEmailForm("", false);
    const addEventListener = vi.spyOn(fake.form, "addEventListener");

    expect(bindRememberedAuthEmailForm(fake.form, { restore: true }, storage)).toBeNull();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(entries.get(REMEMBERED_AUTH_EMAIL_KEY)).toBe("user@example.com");
  });
});
