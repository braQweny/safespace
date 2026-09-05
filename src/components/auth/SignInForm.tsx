import React, { useState } from "react";
import { useFormValidationFocus } from "@/components/hooks/useFormValidationFocus";
import { Mail, Lock, LogIn } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { useRememberedAuthEmail } from "@/components/hooks/useRememberedAuthEmail";
import { LocaleProvider } from "@/components/LocaleProvider";
import type { Locale } from "@/lib/i18n/locale";
import { getAuthFormCopy } from "./auth-form-copy";

interface Props {
  locale: Locale;
  serverError?: string | null;
}

export default function SignInForm({ locale, serverError }: Props) {
  return (
    <LocaleProvider locale={locale}>
      <SignInFormView locale={locale} serverError={serverError} />
    </LocaleProvider>
  );
}

function SignInFormView({ locale, serverError }: Props) {
  const copy = getAuthFormCopy(locale);
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
      next.email = copy.errors.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = copy.errors.emailInvalid;
    }
    if (!password) {
      next.password = copy.errors.passwordRequired;
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
        autoComplete="current-password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={copy.passwordPlaceholder}
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

      <SubmitButton pendingText={copy.signInPending} icon={<LogIn className="size-4" />}>
        {copy.signIn}
      </SubmitButton>
    </form>
  );
}
