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

/**
 * `Request.formData()` rzuca na ciele, które nie jest formularzem (np. JSON
 * wysłany na trasę formularzową) — kiedyś wychodziło z tego 500. Nieczytelne
 * ciało to pusty formularz: walidacja trasy odpowiada swoim zwykłym kodem
 * i redirectem, bez drugiej ścieżki błędu.
 */
export async function readFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}
