import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  /** Formularz już wysłany (`useNativeSubmitPending`) — natywny POST nie zgłasza tego Reactowi sam. */
  pending: boolean;
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pending, pendingText, icon, children }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring h-12 w-full rounded-[14px] px-4 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          {/* Kolor napisu przycisku, nie biel: po zmroku marka jest jasna, a napis ciemny. */}
          <span
            aria-hidden="true"
            className="border-surface/40 border-t-surface size-4 animate-spin rounded-full border-2"
          />
          {pendingText}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          {icon}
          {children}
        </span>
      )}
    </Button>
  );
}
