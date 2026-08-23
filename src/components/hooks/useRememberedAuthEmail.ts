import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createRememberedAuthEmailReader,
  forgetRememberedAuthEmail,
  rememberAuthEmail,
} from "@/components/auth/remembered-auth-email";

const subscribeNever = () => () => {
  // The remembered address is read once per mount and never changes afterwards.
};

const getEmptySnapshot = () => "";

interface UseRememberedAuthEmailOptions {
  /**
   * `true` when the page came back with a server-side error — the only case
   * where refilling the field helps. Without an error the slot is cleared, so a
   * shared device never suggests the previous person's address.
   */
  shouldRestore: boolean;
}

/**
 * E-mail field state for the native-POST auth forms (sign-in, sign-up). The
 * value typed by the user is saved to `sessionStorage` on submit and restored
 * after the error redirect; the URL never carries it.
 *
 * Restoration goes through `useSyncExternalStore` so SSR and the hydration
 * render both see an empty field and only the first client render after
 * hydration picks up the stored address — no hydration mismatch, no setState
 * inside an effect.
 */
export function useRememberedAuthEmail({ shouldRestore }: UseRememberedAuthEmailOptions) {
  const [readRememberedEmail] = useState(() => createRememberedAuthEmailReader());
  const restoredEmail = useSyncExternalStore(
    subscribeNever,
    () => (shouldRestore ? (readRememberedEmail() ?? "") : ""),
    getEmptySnapshot,
  );
  const [typedEmail, setTypedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldRestore) {
      forgetRememberedAuthEmail();
    }
  }, [shouldRestore]);

  const email = typedEmail ?? restoredEmail;

  function rememberEmailBeforeSubmit() {
    rememberAuthEmail(email);
  }

  return { email, setEmail: setTypedEmail, rememberEmailBeforeSubmit };
}
