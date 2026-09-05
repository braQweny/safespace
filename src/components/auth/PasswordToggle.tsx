import { Eye, EyeOff } from "lucide-react";
import { useIsHydrated } from "@/components/hooks/useIsHydrated";
import { useLocale } from "@/components/hooks/useLocale";
import { getAuthFormCopy } from "./auth-form-copy";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  const hydrated = useIsHydrated();
  const copy = getAuthFormCopy(useLocale());

  return (
    <button
      type="button"
      disabled={!hydrated}
      onClick={onToggle}
      className="text-ink-muted hover:bg-surface-soft hover:text-brand-deep focus-visible:ring-brand-ring absolute top-1/2 right-1 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-50"
      aria-label={visible ? copy.hidePassword : copy.showPassword}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
