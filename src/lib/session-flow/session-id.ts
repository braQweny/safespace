/**
 * Session ids are Postgres `uuid` primary keys. Routes validate the path param
 * up front so malformed ids fail fast as `session_not_found` instead of
 * reaching the database query layer.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSessionIdParam(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}
