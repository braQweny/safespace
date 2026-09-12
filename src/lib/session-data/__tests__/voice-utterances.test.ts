import { describe, expect, it, vi } from "vitest";
import { VOICE_UTTERANCE_BATCH_LIMIT, appendVoiceSessionUtterances } from "../voice-utterances";
import type { SessionDataContext, VoiceUtteranceInput } from "../types";

function createContext(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { context: { supabase: { rpc }, user: { id: "user-1" } } as unknown as SessionDataContext, rpc };
}

const utterances: VoiceUtteranceInput[] = [
  { utteranceId: "11111111-1111-4111-8111-111111111111", role: "user", content: "Cześć." },
  { utteranceId: "22222222-2222-4222-8222-222222222222", role: "assistant", content: "Słucham." },
];

describe("appendVoiceSessionUtterances", () => {
  it("sends the batch to the RPC as snake_case rows and maps the persisted messages back", async () => {
    const { context, rpc } = createContext({
      data: {
        inserted: 2,
        skipped: 0,
        messages: [
          {
            id: "m1",
            session_id: "session-1",
            user_id: "user-1",
            role: "user",
            sequence_index: 0,
            content: "Cześć.",
            utterance_id: utterances[0].utteranceId,
            created_at: "2026-09-12T18:00:00.000Z",
          },
        ],
      },
      error: null,
    });

    const result = await appendVoiceSessionUtterances(context, "session-1", utterances);

    expect(rpc).toHaveBeenCalledWith("append_voice_session_utterances", {
      p_session_id: "session-1",
      p_utterances: [
        { utterance_id: utterances[0].utteranceId, role: "user", content: "Cześć." },
        { utterance_id: utterances[1].utteranceId, role: "assistant", content: "Słucham." },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        inserted: 2,
        skipped: 0,
        messages: [
          {
            id: "m1",
            sessionId: "session-1",
            userId: "user-1",
            role: "user",
            sequenceIndex: 0,
            content: "Cześć.",
            createdAt: "2026-09-12T18:00:00.000Z",
          },
        ],
      },
    });
  });

  it("does not call the database for an empty batch and refuses an oversized one", async () => {
    const { context, rpc } = createContext({ data: null, error: null });

    await expect(appendVoiceSessionUtterances(context, "session-1", [])).resolves.toEqual({
      ok: true,
      data: { inserted: 0, skipped: 0, messages: [] },
    });
    const oversized = Array.from({ length: VOICE_UTTERANCE_BATCH_LIMIT + 1 }, (_, index) => ({
      ...utterances[0],
      utteranceId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    await expect(appendVoiceSessionUtterances(context, "session-1", oversized)).resolves.toEqual({
      ok: false,
      error: { code: "write_failed" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the voice SQLSTATEs to stable codes without leaking the raw message", async () => {
    for (const [sqlstate, code] of [
      ["P0015", "session_mode_mismatch"],
      ["P0002", "session_not_found"],
      ["P0004", "invalid_lifecycle_transition"],
      ["P0007", "session_expired"],
      ["22023", "write_failed"],
    ] as const) {
      const { context } = createContext({ data: null, error: { code: sqlstate, message: "raw details" } });
      const result = await appendVoiceSessionUtterances(context, "session-1", utterances);

      expect(result).toEqual({ ok: false, error: { code } });
      expect(JSON.stringify(result)).not.toContain("raw details");
    }
  });

  it("treats a malformed payload as a write failure", async () => {
    const { context } = createContext({ data: { inserted: "2" }, error: null });

    await expect(appendVoiceSessionUtterances(context, "session-1", utterances)).resolves.toEqual({
      ok: false,
      error: { code: "write_failed" },
    });
  });
});
