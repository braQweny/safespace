import { isRecord } from "@/lib/type-guards";
import { getOwnedDifficultyCard, getOwnedPersonCard } from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext } from "@/lib/session-data/types";
import { parseSessionIdParam } from "./session-id";

/**
 * Opcjonalne body startu: `{ aboutPersonId }` z karty osoby („Porozmawiaj o
 * tej osobie”) albo `{ aboutDifficultyId }` z karty trudności („Porozmawiaj o
 * tym”). Brak body albo pusty obiekt działa jak dotychczas; dotychczasowy
 * klient nie wysyła ani body, ani nagłówka Content-Type.
 */
export type SessionStartRequestBody =
  { ok: true; aboutPersonId: string | null; aboutDifficultyId: string | null } | { ok: false };

const EMPTY_START: SessionStartRequestBody = { ok: true, aboutPersonId: null, aboutDifficultyId: null };

/** `null` = brak pola; `undefined` = obecne, ale nie jest UUID. */
function readOptionalId(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "string" ? parseSessionIdParam(value) : null;
  return parsed ?? undefined;
}

export async function readSessionStartRequestBody(request: Request): Promise<SessionStartRequestBody> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return EMPTY_START;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false };
  }
  if (body === null || body === undefined) return EMPTY_START;
  if (!isRecord(body)) return { ok: false };
  const aboutPersonId = readOptionalId(body.aboutPersonId);
  const aboutDifficultyId = readOptionalId(body.aboutDifficultyId);
  if (aboutPersonId === undefined || aboutDifficultyId === undefined) return { ok: false };
  return { ok: true, aboutPersonId, aboutDifficultyId };
}

/**
 * Karta musi należeć do właściciela i do perspektywy, z którą rusza rozmowa —
 * cudza albo z innego awatara nie trafia do briefu ani do wiersza sesji.
 */
export async function resolveAboutPersonForStart(
  context: SessionDataContext,
  aboutPersonId: string | null,
  avatarId: SessionAvatarId,
): Promise<{ ok: true; aboutPersonId: string | null } | { ok: false; code: "validation_failed" | "read_failed" }> {
  if (!aboutPersonId) return { ok: true, aboutPersonId: null };
  const card = await getOwnedPersonCard(context, aboutPersonId);
  if (!card.ok) return { ok: false, code: "read_failed" };
  const person = card.data;
  if (person?.avatarId !== avatarId) return { ok: false, code: "validation_failed" };
  return { ok: true, aboutPersonId: person.id };
}

/** Ta sama reguła dla trudności z mapy tematów: właściciel i perspektywa, nigdy etykieta. */
export async function resolveAboutDifficultyForStart(
  context: SessionDataContext,
  aboutDifficultyId: string | null,
  avatarId: SessionAvatarId,
): Promise<{ ok: true; aboutDifficultyId: string | null } | { ok: false; code: "validation_failed" | "read_failed" }> {
  if (!aboutDifficultyId) return { ok: true, aboutDifficultyId: null };
  const card = await getOwnedDifficultyCard(context, aboutDifficultyId);
  if (!card.ok) return { ok: false, code: "read_failed" };
  const difficulty = card.data;
  if (difficulty?.avatarId !== avatarId) return { ok: false, code: "validation_failed" };
  return { ok: true, aboutDifficultyId: difficulty.id };
}
