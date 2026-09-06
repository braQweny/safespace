import type { APIRoute } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { getValidAvatarChoice } from "@/lib/modalities";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionAiProviderFailedEvent,
  buildSessionPeopleMemoryUpdatedEvent,
} from "@/lib/operational-visibility/session-events";
import { prepareOwnedPeopleMemory } from "@/lib/session-flow/people-memory";
import { isPeopleMemoryEnabled } from "@/lib/session-flow/people-memory-mode";
import { requireSessionRouteAccess } from "@/lib/session-flow/route-access";
import { isRecord } from "@/lib/type-guards";

export const prerender = false;

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Przygotowuje karty osób właściciela w tle — osobno od pamięci, na którą czeka
 * start rozmowy. Bez sprawdzania limitu rozmów: aktualizacja własnej historii
 * to nie prawo do nowej rozmowy, a wyczerpany limit to właśnie moment, w którym
 * karty z ostatniej rozmowy mają się pojawić. Limiter obejmuje trasę w middleware.
 */
export const POST: APIRoute = async (context) => {
  const startedAtMs = performance.now();
  const access = await requireSessionRouteAccess(context);
  if (!access.ok) return json({ ok: false, code: access.error.code }, access.error.status);
  if (!isPeopleMemoryEnabled()) return json({ ok: false, code: "people_memory_unavailable" }, 404);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, code: "validation_failed" }, 400);
  }
  const avatar =
    isRecord(body) && typeof body.modalityId === "string" && typeof body.avatarId === "string"
      ? getValidAvatarChoice(body.modalityId, body.avatarId)
      : null;
  if (!avatar) return json({ ok: false, code: "validation_failed" }, 400);

  const operationalContext = await buildOperationalRequestContext(context);
  const people = await prepareOwnedPeopleMemory(access.data, avatar, { locale: getRequestLocale(context.locals) });

  if (!people.ok) {
    if (!people.providerFailure) return json({ ok: false, code: "people_memory_unavailable" }, 503);
    // Awaria providera zatrzymuje pracę w tle bez udawania, że kart brakuje;
    // kursory stoją, kolejne wejście wznowi.
    logOperationalEvent(
      buildSessionAiProviderFailedEvent({
        reasonCode: people.providerFailure,
        provider: "openrouter",
        durationMs: getOperationalDurationMs(startedAtMs),
      }),
      operationalContext,
    );
    return json({ ok: true, type: "people_memory_paused", updated: false }, 200);
  }

  if (people.updated) {
    logOperationalEvent(
      buildSessionPeopleMemoryUpdatedEvent({
        durationMs: getOperationalDurationMs(startedAtMs),
        partial: people.partial,
        inputUnits: people.usage?.inputUnits,
        outputUnits: people.usage?.outputUnits,
      }),
      operationalContext,
    );
  }

  return json(
    { ok: true, type: people.ready ? "people_memory_ready" : "people_memory_preparing", updated: people.updated },
    people.ready ? 200 : 202,
  );
};
