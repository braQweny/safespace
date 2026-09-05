import React, { useState } from "react";
import { useFormValidationFocus } from "@/components/hooks/useFormValidationFocus";
import { CheckCircle2, KeyRound, Lock } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { LocaleProvider } from "@/components/LocaleProvider";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-validation";
import type { Locale } from "@/lib/i18n/locale";
import { getAuthFormCopy } from "./auth-form-copy";

interface Props {
  locale: Locale;
  serverError?: string | null;
  serverSuccess?: string | null;
}

export default function SetPasswordForm({ locale, serverError, serverSuccess }: Props) {
  return (
    <LocaleProvider locale={locale}>
      <SetPasswordFormView locale={locale} serverError={serverError} serverSuccess={serverSuccess} />
    </LocaleProvider>
  );
}

function SetPasswordFormView({ locale, serverError, serverSuccess }: Props) {
  const copy = getAuthFormCopy(locale);
  const { formRef, focusFirstError } = useFormValidationFocus();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

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
    }
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
      action="/api/auth/password"
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
    >
      <FormField
        id="password"
        label={copy.newPasswordLabel}
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

      {serverSuccess ? (
        <p
          className="border-brand-soft bg-brand-tint text-brand-deep flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm leading-6"
          role="status"
        >
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {serverSuccess}
        </p>
      ) : null}

      <SubmitButton pendingText={copy.savePending} icon={<KeyRound className="size-4" />}>
        {copy.savePassword}
      </SubmitButton>
    </form>
  );
}
