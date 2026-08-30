import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

interface SubmitButtonProps {
  pendingText: string;
  icon: ReactNode;
  children: ReactNode;
}

export function SubmitButton({ pendingText, icon, children }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring h-12 w-full rounded-[14px] px-4 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2"
    >
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
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
