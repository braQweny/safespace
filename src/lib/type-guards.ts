/**
 * Shared structural type guards. `session-data/repository.ts` keeps its own
 * looser record check (arrays allowed) on purpose — do not swap it for this
 * one without revisiting the row-coercion semantics there.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
