import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p
      className="border-danger-line bg-danger-soft text-danger flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm leading-6"
      role="alert"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
