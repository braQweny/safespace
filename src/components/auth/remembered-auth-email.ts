/**
 * Remembers the e-mail typed into an auth form across the native POST →
 * redirect round-trip, so a server-side error page can refill the field.
 *
 * The address lives only in `sessionStorage` (this tab, until it is closed)
 * under one key, and every reader takes it out again. It never travels in the
 * URL: query strings land in history, referrers and logs.
 *
 * Every storage access is wrapped in try/catch — private windows, disabled
 * site data and SSR all make `sessionStorage` unavailable or throw.
 */

export const REMEMBERED_AUTH_EMAIL_KEY = "safespace.auth.email";

/** RFC 5321 caps the whole address at 254 characters; anything longer is not an e-mail we want to keep. */
const MAX_REMEMBERED_EMAIL_LENGTH = 254;

export interface RememberedAuthEmailStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveSessionStorage(): RememberedAuthEmailStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeRememberedEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REMEMBERED_EMAIL_LENGTH) {
    return null;
  }

  return trimmed;
}

/** Stores the address right before a form submits; an empty value clears the slot instead. */
export function rememberAuthEmail(email: string, storage = resolveSessionStorage()) {
  const normalized = normalizeRememberedEmail(email);

  try {
    if (!normalized) {
      storage?.removeItem(REMEMBERED_AUTH_EMAIL_KEY);
      return;
    }

    storage?.setItem(REMEMBERED_AUTH_EMAIL_KEY, normalized);
  } catch {
    // Best effort only — the form still submits without the convenience.
  }
}

/** Reads and immediately forgets the remembered address (one redirect, one restore). */
export function takeRememberedAuthEmail(storage = resolveSessionStorage()) {
  try {
    const remembered = normalizeRememberedEmail(storage?.getItem(REMEMBERED_AUTH_EMAIL_KEY));
    storage?.removeItem(REMEMBERED_AUTH_EMAIL_KEY);
    return remembered;
  } catch {
    return null;
  }
}

/** Drops a leftover address, e.g. when an auth form opens without an error to recover from. */
export function forgetRememberedAuthEmail(storage = resolveSessionStorage()) {
  try {
    storage?.removeItem(REMEMBERED_AUTH_EMAIL_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/**
 * A reader that takes the remembered address once and then keeps answering
 * with that same value. React reads it through `useSyncExternalStore`, which
 * may call the snapshot getter several times per mount — the cache keeps those
 * calls consistent after the storage slot has already been emptied.
 */
export function createRememberedAuthEmailReader(storage = resolveSessionStorage()) {
  let cached: string | null | undefined;

  return function readRememberedAuthEmailOnce() {
    if (cached === undefined) {
      cached = takeRememberedAuthEmail(storage);
    }

    return cached;
  };
}

interface BindRememberedAuthEmailFormOptions {
  /** Restore (and thereby consume) the remembered address; `false` clears it instead. */
  restore: boolean;
}

/**
 * Plain-HTML counterpart of `useRememberedAuthEmail` for the Astro forms that
 * have no React island: fills the form's `email` input from the remembered
 * address (when asked to) and saves whatever is in the field on submit.
 * Returns the restored address so the page can reuse it elsewhere.
 */
export function bindRememberedAuthEmailForm(
  form: HTMLFormElement,
  { restore }: BindRememberedAuthEmailFormOptions,
  storage = resolveSessionStorage(),
) {
  const input = form.querySelector<HTMLInputElement>('input[name="email"]');
  if (!input) {
    return null;
  }

  let remembered: string | null = null;
  if (restore) {
    remembered = takeRememberedAuthEmail(storage);
  } else {
    forgetRememberedAuthEmail(storage);
  }

  if (remembered && !input.value) {
    input.value = remembered;
  }

  form.addEventListener("submit", () => {
    rememberAuthEmail(input.value, storage);
  });

  return remembered;
}
