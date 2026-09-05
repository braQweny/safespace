import type { InputHTMLAttributes, ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Papier i promienie jak w reszcie aplikacji — te ekrany stały wcześniej na
 * czystej bieli z promieniem 10 px, więc pierwszy ekran nowej osoby wyglądał
 * jak inny produkt. Placeholder miał twardo wpisane #87968f (3,09:1) zamiast
 * tokenu; teraz to `ink-muted`, czyli 5,58:1.
 */
const inputBase =
  "w-full rounded-[14px] border bg-surface px-3.5 pl-11 h-12 text-ink placeholder:text-ink-muted transition-colors focus:outline-none focus:ring-2";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-ink-soft mb-1 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <span className="text-ink-muted absolute top-1/2 left-3 size-4 -translate-y-1/2">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            inputBase,
            endContent && "pr-14",
            error ? "border-danger focus:ring-danger-line" : "border-line-strong focus:ring-brand-ring",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-danger mt-1.5 flex items-center gap-1.5 text-xs">
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <div id={`${id}-hint`}>{hint}</div>
      ) : null}
    </div>
  );
}
