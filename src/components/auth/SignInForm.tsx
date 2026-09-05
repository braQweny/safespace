import React, { useState } from "react";
import { useFormValidationFocus } from "@/components/hooks/useFormValidationFocus";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useRememberedAuthEmail } from "@/components/hooks/useRememberedAuthEmail";

interface Props {
  serverError?: string | null;
}

export default function SignInForm({ serverError }: Props) {
  // Native POST + redirect would otherwise drop the typed address on every
  // server-side error; it is restored only when such an error is shown.
  const { email, setEmail, rememberEmailBeforeSubmit } = useRememberedAuthEmail({
    shouldRestore: Boolean(serverError),
  });
  const { formRef, focusFirstError } = useFormValidationFocus();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail";
    }
    if (!password) {
      next.password = "Podaj hasło";
    }
    setErrors(next);
    focusFirstError(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }

    rememberEmailBeforeSubmit();
  }

  return (
    <form
      ref={formRef}
      method="POST"
      action="/api/auth/signin"
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="email"
        type="email"
        autoComplete="email"
        label="E-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="ty@example.com"
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label="Hasło"
        autoComplete="current-password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Twoje hasło"
        error={errors.password}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Logowanie..." icon={<LogIn className="size-4" />}>
        Zaloguj się
      </SubmitButton>
    </form>
  );
}
