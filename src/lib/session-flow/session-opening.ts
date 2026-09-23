import { getValidAvatarChoice } from "@/lib/modalities";
import type { Locale } from "@/lib/i18n/locale";
import { generateSessionResponse } from "@/lib/session-ai/provider";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { loadOwnedSessionContinuity, toSessionPromptContext } from "./session-continuity";
import { getProviderTimeoutWithinSessionMs } from "./time-limit";
import { persistOpeningMessage } from "./message-persistence";
import type { SessionMessageViewModel } from "./message-contract";

export type SessionOpeningFailure = "opening_provider_failed" | "opening_persistence_failed" | "opening_unavailable";

export interface SessionOpeningOptions {
  /** Język otwarcia — język interfejsu w chwili startu. */
  locale: Locale;
}

export type SessionOpeningResult =
  { ok: true; message: SessionMessageViewModel | null } | { ok: false; failure: SessionOpeningFailure };

/**
 * Generates and persists the avatar's opening message for a freshly started
 * session. Never throws: a failed or skipped opening degrades to a session that
 * simply starts without one, so the start route can still succeed.
 */
export async function createSessionOpeningMessage(
  context: SessionDataContext,
  session: SessionMetadata,
  options: SessionOpeningOptions,
): Promise<SessionOpeningResult> {
  const modality = getValidAvatarChoice(session.modalityId, session.avatarId);

  if (!modality) {
    return { ok: false, failure: "opening_unavailable" };
  }

  if (getProviderTimeoutWithinSessionMs(session, new Date()) <= 0) {
    return { ok: true, message: null };
  }

  const summaries = await loadOwnedSessionContinuity(context, session);

  if (!summaries.ok) {
    return { ok: false, failure: "opening_unavailable" };
  }

  let assistantText: string;

  try {
    const response = await generateSessionResponse({
      mode: "opening",
      ...toSessionPromptContext(modality, summaries, options.locale),
      sessionPhase: "opening",
      locale: options.locale,
    });

    assistantText = response.assistantText;
  } catch {
    return { ok: false, failure: "opening_provider_failed" };
  }

  const persisted = await persistOpeningMessage(context, {
    sessionId: session.id,
    assistantMessage: assistantText,
  });

  if (!persisted.ok) {
    return { ok: false, failure: "opening_persistence_failed" };
  }

  return { ok: true, message: persisted.data };
}
