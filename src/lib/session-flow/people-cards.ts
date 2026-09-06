import type { SessionDataErrorCode } from "@/lib/session-data/errors";
import {
  deleteOwnedPersonFact,
  forgetOwnedPerson,
  listOwnedPersonCards,
  updateOwnedPersonCard,
  updateOwnedPersonFact,
} from "@/lib/session-data/repository";
import type { SessionAvatarId, SessionDataContext } from "@/lib/session-data/types";
import {
  peopleFailure,
  type PeopleFailureCode,
  type PeopleListResponse,
  type PersonFactDeleteResponse,
  type PersonForgetResponse,
  type PersonUpdateRequest,
  type PersonUpdateResponse,
} from "./people-contract";

/** Kody warstwy danych, które przechodzą do klienta bez zmiany znaczenia. */
function mapPeopleDataCode(code: SessionDataErrorCode, fallback: PeopleFailureCode): PeopleFailureCode {
  if (code === "missing_auth" || code === "session_data_unavailable" || code === "read_failed") return code;
  return fallback;
}

export async function readPersonCards(
  context: SessionDataContext,
  avatarId: SessionAvatarId,
): Promise<PeopleListResponse> {
  const cards = await listOwnedPersonCards(context, avatarId);
  return cards.ok
    ? { ok: true, type: "people_list", cards: cards.data }
    : peopleFailure(mapPeopleDataCode(cards.error.code, "read_failed"));
}

export async function updatePersonCard(
  context: SessionDataContext,
  personId: string,
  input: PersonUpdateRequest,
): Promise<PersonUpdateResponse> {
  const card = await updateOwnedPersonCard(context, { personId, ...input });
  if (!card.ok) return peopleFailure(mapPeopleDataCode(card.error.code, "update_failed"));
  return card.data ? { ok: true, type: "person_updated", card: card.data } : peopleFailure("person_not_found");
}

export async function updatePersonFact(
  context: SessionDataContext,
  factId: string,
  text: string,
): Promise<PersonUpdateResponse> {
  const card = await updateOwnedPersonFact(context, factId, text);
  if (!card.ok) return peopleFailure(mapPeopleDataCode(card.error.code, "update_failed"));
  return card.data ? { ok: true, type: "person_updated", card: card.data } : peopleFailure("fact_not_found");
}

export async function deletePersonFact(context: SessionDataContext, factId: string): Promise<PersonFactDeleteResponse> {
  const result = await deleteOwnedPersonFact(context, factId);
  if (!result.ok) return peopleFailure(mapPeopleDataCode(result.error.code, "delete_failed"));
  if (!result.data) return peopleFailure("fact_not_found");
  return { ok: true, type: "person_fact_deleted", personId: result.data.personId, card: result.data.card };
}

export async function forgetPersonCard(context: SessionDataContext, personId: string): Promise<PersonForgetResponse> {
  const forgotten = await forgetOwnedPerson(context, personId);
  if (!forgotten.ok) return peopleFailure(mapPeopleDataCode(forgotten.error.code, "forget_failed"));
  return forgotten.data ? { ok: true, type: "person_forgotten", personId } : peopleFailure("person_not_found");
}
