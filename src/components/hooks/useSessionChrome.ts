import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Wspólne zachowanie paska rozmowy pisanej i głosowej: dialog potwierdzenia
 * zakończenia i nakładka pomocy kryzysowej razem z powrotem fokusu tam, skąd
 * się otworzyły — inaczej klawiatura „spada” na początek dokumentu, a czytnik
 * ekranu traci miejsce w rozmowie.
 */
export function useSessionChrome() {
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const [isCrisisHelpOpen, setIsCrisisHelpOpen] = useState(false);
  const confirmEndRef = useRef<HTMLDivElement | null>(null);
  const endButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreEndFocusRef = useRef(false);
  const crisisTriggerRef = useRef<HTMLButtonElement | null>(null);
  const restoreCrisisFocusRef = useRef(false);

  useEffect(() => {
    if (isConfirmingEnd) {
      confirmEndRef.current?.focus();
      return;
    }

    // Przycisk jest wyłączony, dopóki dialog jest otwarty, więc fokus musi
    // poczekać na render po zamknięciu.
    if (restoreEndFocusRef.current) {
      restoreEndFocusRef.current = false;
      endButtonRef.current?.focus();
    }
  }, [isConfirmingEnd]);

  const requestEnd = useCallback(() => {
    setIsConfirmingEnd(true);
  }, []);

  const cancelEndConfirmation = useCallback(() => {
    restoreEndFocusRef.current = true;
    setIsConfirmingEnd(false);
  }, []);

  /** Zamyka dialog bez przywracania fokusu: rozmowa właśnie się kończy. */
  const closeEndConfirmation = useCallback(() => {
    setIsConfirmingEnd(false);
  }, []);

  // Ten sam wzorzec co przy dialogu zakończenia: po Escape albo „Zamknij”
  // fokus wraca na „Pomoc”, a nie na początek dokumentu.
  useEffect(() => {
    if (isCrisisHelpOpen || !restoreCrisisFocusRef.current) {
      return;
    }

    restoreCrisisFocusRef.current = false;
    crisisTriggerRef.current?.focus();
  }, [isCrisisHelpOpen]);

  const closeCrisisHelp = useCallback(() => {
    restoreCrisisFocusRef.current = true;
    setIsCrisisHelpOpen(false);
  }, []);

  const toggleCrisisHelp = useCallback(() => {
    setIsCrisisHelpOpen((open) => !open);
  }, []);

  return {
    isConfirmingEnd,
    requestEnd,
    cancelEndConfirmation,
    closeEndConfirmation,
    isCrisisHelpOpen,
    toggleCrisisHelp,
    closeCrisisHelp,
    confirmEndRef,
    endButtonRef,
    crisisTriggerRef,
  };
}
