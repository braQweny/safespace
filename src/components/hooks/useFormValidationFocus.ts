import { useEffect, useRef, useState } from "react";

/** Fokus dopiero po wyrenderowaniu błędów; poprawianie pól nie przenosi go ponownie. */
export function useFormValidationFocus() {
  const formRef = useRef<HTMLFormElement>(null);
  const [request, setRequest] = useState<{ field: string } | null>(null);

  useEffect(() => {
    if (!request) return;
    const field = formRef.current?.elements.namedItem(request.field);
    if (field instanceof HTMLElement) field.focus();
  }, [request]);

  function focusFirstError(errors: Record<string, string | undefined>) {
    const field = Object.keys(errors).find((name) => Boolean(errors[name]));
    if (field) setRequest({ field });
  }

  return { formRef, focusFirstError };
}
