import { Eye, EyeOff } from "lucide-react";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-ink-muted hover:bg-surface-soft hover:text-brand-deep focus-visible:ring-brand-ring absolute top-1/2 right-1 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2"
      aria-label={visible ? "Ukryj hasło" : "Pokaż hasło"}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
