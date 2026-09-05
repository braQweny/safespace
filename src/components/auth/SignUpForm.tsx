import React, { useState } from "react";
import { useFormValidationFocus } from "@/components/hooks/useFormValidationFocus";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useRememberedAuthEmail } from "@/components/hooks/useRememberedAuthEmail";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-validation";

interface Props {
  serverError?: string | null;
}

export default function SignUpForm({ serverError }: Props) {
  // Native POST + redirect would otherwise drop the typed address on every
  // server-side error; it is restored only when such an error is shown.
  const { email, setEmail, rememberEmailBeforeSubmit } = useRememberedAuthEmail({
    shouldRestore: Boolean(serverError),
  });
  const { formRef, focusFirstError } = useFormValidationFocus();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = "Podaj adres e-mail";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Podaj poprawny adres e-mail";
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Powtórz hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła muszą być takie same";
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

  const passwordHint = (
    <p className="text-ink-muted mt-1 text-xs">
      {password.length > 0 && password.length < MIN_PASSWORD_LENGTH
        ? `Brakuje znaków: ${MIN_PASSWORD_LENGTH - password.length}`
        : `Co najmniej ${MIN_PASSWORD_LENGTH} znaków.`}
    </p>
  );

  return (
    <form
      ref={formRef}
      method="POST"
      action="/api/auth/signup"
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
        autoComplete="new-password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder="Wpisz nowe hasło"
        error={errors.password}
        hint={passwordHint}
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

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        autoComplete="new-password"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło ponownie"
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Tworzenie konta..." icon={<UserPlus className="size-4" />}>
        Utwórz konto
      </SubmitButton>
    </form>
  );
}
