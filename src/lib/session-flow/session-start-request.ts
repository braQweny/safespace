import { isRecord } from "@/lib/type-guards";
import { getOwnedPersonCard } from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext } from "@/lib/session-data/types";
import { parseSessionIdParam } from "./session-id";

/**
 * Opcjonalne body startu: `{ aboutPersonId }` z karty osoby („Porozmawiaj o
 * tej osobie”). Brak body albo pusty obiekt działa jak dotychczas; dotychczasowy
 * klient nie wysyła ani body, ani nagłówka Content-Type.
 */
export type SessionStartRequestBody = { ok: true; aboutPersonId: string | null } | { ok: false };

export async function readSessionStartRequestBody(request: Request): Promise<SessionStartRequestBody> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return { ok: true, aboutPersonId: null };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false };
  }
  if (body === null || body === undefined) return { ok: true, aboutPersonId: null };
  if (!isRecord(body)) return { ok: false };
  const { aboutPersonId } = body;
  if (aboutPersonId === undefined || aboutPersonId === null) return { ok: true, aboutPersonId: null };
  const parsed = typeof aboutPersonId === "string" ? parseSessionIdParam(aboutPersonId) : null;
  return parsed ? { ok: true, aboutPersonId: parsed } : { ok: false };
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
