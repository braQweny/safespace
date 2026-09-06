/**
 * Soczewki tematyczne: krótkie moduły promptu doklejane do sekcji nurtu, gdy
 * rozmowa wyraźnie krąży wokół jednego tematu. „Lekarz prowadzący i ławka
 * specjalistów” bez zmiany modelu ani awatara: soczewka mówi, co słyszeć i o co
 * pytać, nigdy „działaj jak” — awatar zachowuje własny głos i własny `Avoid:`.
 * Wykrywa je osobny, tani klasyfikator (`session-lens/`), fail-open; etykieta
 * jest lepka na sesję (`therapy_sessions.session_lens`) i nie trafia do logów.
 */
export const SESSION_LENS_IDS = ["family_of_origin", "work_burnout", "anxiety_avoidance"] as const;

export type SessionLensId = (typeof SESSION_LENS_IDS)[number];

export function isSessionLensId(value: unknown): value is SessionLensId {
  return typeof value === "string" && (SESSION_LENS_IDS as readonly string[]).includes(value);
}

/** Budżet redakcyjny jednego modułu; pinowany testem, nie przycinany w prompcie. */
export const SESSION_LENS_MAX_CHARS = 600;

const SESSION_LENS_GUIDANCE: Readonly<Record<SessionLensId, string>> = {
  family_of_origin:
    "Family of origin. Listen for: the role the user was handed as a child (the responsible one, the peacemaker, the invisible one), unspoken rules about which feelings were allowed, loyalty that makes any criticism of a parent feel like betrayal, and old patterns replaying in adult relationships. Ask, one at a time: what could be felt or said at home; who noticed when they were struggling; what they wished an adult had done; what of that they still carry, and what they have already changed. Stay with the user's experience of their family, never with verdicts about relatives.",
  work_burnout:
    "Work and burnout. Listen for: exhaustion that rest no longer repairs, cynicism about work that used to matter, a sense of getting nothing done, life outside work shrinking, and the story that everything depends on the user. Ask: what has changed in how work feels compared with a year ago; where the pressure comes from — the load, the meaning, the people, or the user's own standards; what recovers them even briefly; what they would put down first if they could. Keep the frame on the user's situation and choices, not on diagnosing burnout or fixing the workplace.",
  anxiety_avoidance:
    "Anxiety and avoidance. Listen for: worry that runs ahead of events, situations quietly avoided and the relief that keeps the avoidance going, safety habits such as rehearsing, checking or over-preparing, and what the avoidance costs in things the user cares about. Ask: what they fear would happen if they did not avoid; how their body signals it; what the worry is trying to protect; what a very small step toward the avoided thing might look like — as an invitation only. Do not push exposure, promise the fear will fade, or treat every worry as a disorder.",
};

export function getSessionLensGuidance(lens: SessionLensId) {
  return SESSION_LENS_GUIDANCE[lens];
}
