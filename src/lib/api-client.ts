/**
 * Minimal browser-safe JSON API client shared by React islands.
 *
 * The client only owns transport concerns: headers, network failures, and JSON
 * parsing. Callers keep narrowing `body` with their contract type guards —
 * there are no `as T` casts here on purpose.
 */
export type ApiJsonResult = { kind: "json"; status: number; body: unknown } | { kind: "network_error" };

export async function requestApiJson(input: string, init?: RequestInit): Promise<ApiJsonResult> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  if (init?.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(input, {
      ...init,
      headers,
    });
  } catch {
    return { kind: "network_error" };
  }

  let body: unknown = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    kind: "json",
    status: response.status,
    body,
  };
}
