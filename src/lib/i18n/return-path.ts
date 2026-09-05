/**
 * Formularz przełącznika języka wraca tam, skąd został wysłany. Wartość
 * pochodzi z ukrytego pola, więc jest traktowana jak każde wejście z sieci:
 * tylko ścieżka tej samej domeny, bez schematu, bez `//`, bez tras API.
 */
const RETURN_PATH_ORIGIN = "https://safespace.local";
const MAX_RETURN_PATH_LENGTH = 512;

export function getSafeReturnPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > MAX_RETURN_PATH_LENGTH) {
    return fallback;
  }

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed, RETURN_PATH_ORIGIN);
  } catch {
    return fallback;
  }

  if (parsed.origin !== RETURN_PATH_ORIGIN || parsed.pathname.startsWith("/api/")) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}`;
}
