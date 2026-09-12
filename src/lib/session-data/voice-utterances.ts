import { mapSupabaseWriteError, ok, sessionDataError, type SessionDataResult } from "./errors";
import { isRecord } from "@/lib/type-guards";
import { coerceMessageRows, mapMessage } from "./rows";
import type { AppendVoiceUtterancesResult, SessionDataContext, SessionId, VoiceUtteranceInput } from "./types";

/**
 * Jedyna ścieżka zapisu transkryptu rozmowy głosowej: RPC
 * `append_voice_session_utterances` (właściciel, blokada wiersza sesji,
 * `mode = 'voice'`, indeksy max+1, znane `utterance_id` pomijane). Wypowiedzi
 * pochodzą z obserwatora po stronie serwera — przeglądarka nigdy nie dostarcza
 * treści do zapisu. Tak jak wszędzie w tym module: treść nie trafia do logów.
 */
export const VOICE_UTTERANCE_BATCH_LIMIT = 50;

export async function appendVoiceSessionUtterances(
  context: SessionDataContext,
  sessionId: SessionId,
  utterances: readonly VoiceUtteranceInput[],
): Promise<SessionDataResult<AppendVoiceUtterancesResult>> {
  if (utterances.length === 0) {
    return ok({ inserted: 0, skipped: 0, messages: [] });
  }

  if (utterances.length > VOICE_UTTERANCE_BATCH_LIMIT) {
    return sessionDataError("write_failed");
  }

  const response = (await context.supabase.rpc("append_voice_session_utterances", {
    p_session_id: sessionId,
    p_utterances: utterances.map((utterance) => ({
      utterance_id: utterance.utteranceId,
      role: utterance.role,
      content: utterance.content,
    })),
  })) as { data: unknown; error: unknown };

  if (response.error) {
    return sessionDataError(mapSupabaseWriteError(response.error));
  }

  const payload = isRecord(response.data)
    ? (response.data as { inserted?: unknown; skipped?: unknown; messages?: unknown })
    : null;

  if (!payload || typeof payload.inserted !== "number" || typeof payload.skipped !== "number") {
    return sessionDataError("write_failed");
  }

  return ok({
    inserted: payload.inserted,
    skipped: payload.skipped,
    messages: coerceMessageRows(payload.messages).map(mapMessage),
  });
}
