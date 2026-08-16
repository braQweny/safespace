import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const inputBase =
  "w-full rounded-lg border bg-white px-3 py-2 pl-10 text-ink placeholder-[#87968f] transition-colors focus:outline-none focus:ring-2";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
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
        <span className="text-ink-faint absolute top-1/2 left-3 size-4 -translate-y-1/2">{icon}</span>
        <input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            inputBase,
            error ? "border-red-400 focus:ring-red-200" : "border-brand-soft focus:ring-line-accent",
          )}
        />
        {endContent}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1 text-xs text-red-700">
          <CircleAlert aria-hidden="true" className="size-3" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
