import React, { useState } from "react";
import { useFormValidationFocus } from "@/components/hooks/useFormValidationFocus";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useRememberedAuthEmail } from "@/components/hooks/useRememberedAuthEmail";
import { LocaleProvider } from "@/components/LocaleProvider";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-validation";
import type { Locale } from "@/lib/i18n/locale";
import { getAuthFormCopy } from "./auth-form-copy";

interface Props {
  locale: Locale;
  serverError?: string | null;
}

export default function SignUpForm({ locale, serverError }: Props) {
  return (
    <LocaleProvider locale={locale}>
      <SignUpFormView locale={locale} serverError={serverError} />
    </LocaleProvider>
  );
}

function SignUpFormView({ locale, serverError }: Props) {
  const copy = getAuthFormCopy(locale);
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
      next.email = copy.errors.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = copy.errors.emailInvalid;
    }

    if (!password) {
      next.password = copy.errors.passwordRequired;
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = copy.errors.passwordTooShort(MIN_PASSWORD_LENGTH);
    }

    if (!confirmPassword) {
      next.confirmPassword = copy.errors.confirmRequired;
    } else if (password !== confirmPassword) {
      next.confirmPassword = copy.errors.passwordsMismatch;
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
        ? copy.hints.missingChars(MIN_PASSWORD_LENGTH - password.length)
        : copy.hints.minChars(MIN_PASSWORD_LENGTH)}
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
        label={copy.emailLabel}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={copy.emailPlaceholder}
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label={copy.passwordLabel}
        autoComplete="new-password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={copy.newPasswordPlaceholder}
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
        label={copy.repeatPasswordLabel}
        autoComplete="new-password"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={copy.repeatPasswordPlaceholder}
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

      <SubmitButton pendingText={copy.signUpPending} icon={<UserPlus className="size-4" />}>
        {copy.signUp}
      </SubmitButton>
    </form>
  );
}
