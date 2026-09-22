import { useEffect, useState } from "react";

/**
 * Ile czekamy na odejście strony po wysłaniu, zanim przycisk znów zadziała.
 * Przerwana nawigacja (Esc, „Zatrzymaj”, zerwana sieć przy wolnym Supabase)
 * nie wysyła stronie żadnego zdarzenia, a bez tego limitu przycisk zostawał
 * na „Logowanie…”, Enter też był zablokowany i ratowało tylko przeładowanie.
 * 15 s to wyraźnie dłużej niż zwykłe logowanie, więc podwójne kliknięcie
 * w trakcie wysyłki nadal nie wyśle drugiego POST-a.
 */
export const NATIVE_SUBMIT_RESET_MS = 15_000;

/**
 * Formularze logowania wysyłają się natywnie (POST pod adres i przekierowanie),
 * a `useFormStatus` widzi tylko akcje Reacta, więc przy tych formularzach
 * nigdy nie zgłaszał wysyłki. Stan „wysyłam” prowadzi zatem sam formularz:
 * `onSubmit` woła `markSubmitting` dopiero po udanej walidacji, a od razu
 * wyłączony przycisk nie wyśle drugiego POST-a przy podwójnym kliknięciu
 * (limit prób logowania liczy się per IP, więc drugie żądanie zjadało go na darmo).
 *
 * Stan schodzi sam w dwóch przypadkach: powrót przyciskiem „wstecz” przywraca
 * stronę z pamięci podręcznej razem z nim (`pageshow` z `persisted`), a
 * nawigacja, która po `NATIVE_SUBMIT_RESET_MS` wciąż nie opuściła strony,
 * została przerwana. Celowo bez `visibilitychange`: przełączenie karty w
 * trakcie wolnej, ale żywej wysyłki odblokowałoby drugi POST.
 */
export function useNativeSubmitPending() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function resetAfterHistoryRestore(event: PageTransitionEvent) {
      if (event.persisted) {
        setIsSubmitting(false);
      }
    }

    window.addEventListener("pageshow", resetAfterHistoryRestore);

    return () => {
      window.removeEventListener("pageshow", resetAfterHistoryRestore);
    };
  }, []);

  useEffect(() => {
    if (!isSubmitting) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsSubmitting(false);
    }, NATIVE_SUBMIT_RESET_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSubmitting]);

  function markSubmitting() {
    setIsSubmitting(true);
  }

  return { isSubmitting, markSubmitting };
}
