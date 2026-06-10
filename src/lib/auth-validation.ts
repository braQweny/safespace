/**
 * Shared validation rules and form helpers for the auth + profile form
 * endpoints and their React form islands. Keep client and server checks in
 * sync by importing from here instead of redefining constants locally.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 6;

export function getFormString(form: FormData, field: string, trim = true) {
  const value = form.get(field);
  if (typeof value !== "string") {
    return "";
  }

  return trim ? value.trim() : value;
}
