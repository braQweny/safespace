import { describe, expect, it, vi } from "vitest";
import {
  forgetOwnedPerson,
  getOwnedPeopleMemoryWork,
  getOwnedPersonCard,
  listOwnedPersonCards,
  readOwnedPeopleMemoryEnabled,
  saveOwnedPeopleMemoryWork,
  setOwnedPeopleMemoryEnabled,
  updateOwnedPersonCard,
} from "../people-memory";
import { getOwnedSessionPinnedContext } from "../avatar-memory";
import type { SessionDataContext } from "../types";

const message = {
  sessionId: "session",
  role: "user",
  sequenceIndex: 0,
  characterOffset: 20,
  content: "Marta z pracy.",
};
const person = {
  id: "person-1",
  name: "Marta",
  nameLocked: false,
  relation: "koleżanka z pracy",
  relationLocked: true,
  userNote: "",
  facts: [{ id: "fact-1", kind: "account", text: "Skomentowała pomysł.", userEdited: false }],
};
const work = {
  revision: "rev",
  enabled: true,
  persons: [person],
  forgottenPeople: [{ name: "sylwia", relation: null }],
  messages: [message],
};
const card = {
  ...person,
  avatarId: "cbt-guide",
  createdAt: "2026-09-01T10:00:00.000Z",
  firstMentionedAt: "2026-09-01T10:00:00.000Z",
  lastMentionedAt: "2026-09-03T10:00:00.000Z",
  mentionCount: 2,
  facts: [
    {
      ...person.facts[0],
      createdAt: "2026-09-03T10:00:00.000Z",
      sources: [{ sessionId: "session", conversationAt: "2026-09-03T09:00:00.000Z" }],
    },
  ],
};

function context(result: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  return { data: { user: { id: "owner" }, supabase: { rpc } } as unknown as SessionDataContext, rpc };
}

function tableContext(result: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: result, error });
  const builder = { select: vi.fn(), eq: vi.fn(), maybeSingle };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const from = vi.fn().mockReturnValue(builder);
  return { data: { user: { id: "owner" }, supabase: { from } } as unknown as SessionDataContext, from, builder };
}

describe("people memory repository", () => {
  it("reads the bounded batch with the requested budget and validates the private shape", async () => {
    const { data, rpc } = context(work);
    expect(await getOwnedPeopleMemoryWork(data, "cbt-guide", { maxChars: 8000 })).toEqual({ ok: true, data: work });
    expect(rpc).toHaveBeenCalledWith("get_people_memory_batch", { p_avatar_id: "cbt-guide", p_max_chars: 8000 });
    expect(context(work).rpc).not.toHaveBeenCalled();
    await getOwnedPeopleMemoryWork(context(work).data, "cbt-guide");
  });

  it.each([
    { ...work, enabled: "yes" },
    { ...work, persons: [{ ...person, facts: [{ id: "f", kind: "diagnosis", text: "x", userEdited: false }] }] },
    { ...work, forgottenPeople: [{ name: 1 }] },
    { ...work, messages: [{ ...message, characterOffset: 1 }] },
    { ...work, messages: [{ ...message, content: "x".repeat(24001), characterOffset: 24001 }] },
    { ...work, messages: Array.from({ length: 129 }, () => message) },
  ])("rejects malformed or over-budget private work", async (invalid) => {
    expect(await getOwnedPeopleMemoryWork(context(invalid).data, "cbt-guide")).toMatchObject({
      ok: false,
      error: { code: "read_failed" },
    });
  });

  it("saves cursors and the mapped change set in one RPC and surfaces a lost race as false", async () => {
    const { data, rpc } = context(false);
    const cursors = [{ sessionId: "session", sequenceIndex: 0, characterOffset: 20 }];
    const changes = { newPersons: [], updates: [] };
    expect(await saveOwnedPeopleMemoryWork(data, "cbt-guide", { revision: "rev", cursors, changes })).toEqual({
      ok: true,
      data: false,
    });
    expect(rpc).toHaveBeenCalledWith("save_people_memory_batch", {
      p_avatar_id: "cbt-guide",
      p_revision: "rev",
      p_cursors: cursors,
      p_changes: changes,
    });
    const failing = {
      user: { id: "owner" },
      supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "22023" } }) },
    };
    expect(
      await saveOwnedPeopleMemoryWork(failing as unknown as SessionDataContext, "cbt-guide", {
        revision: "rev",
        cursors,
        changes,
      }),
    ).toMatchObject({ ok: false, error: { code: "write_failed" } });
  });

  it("lists and reads cards through the owner-only RPCs, treating a missing card as null", async () => {
    expect(await listOwnedPersonCards(context([card]).data, "cbt-guide")).toEqual({ ok: true, data: [card] });
    expect(await listOwnedPersonCards(context([{ ...card, avatarId: "nope" }]).data, "cbt-guide")).toMatchObject({
      ok: false,
    });
    expect(await getOwnedPersonCard(context(null).data, "person-1")).toEqual({ ok: true, data: null });
    const { data, rpc } = context(card);
    expect(await getOwnedPersonCard(data, "person-1")).toEqual({ ok: true, data: card });
    expect(rpc).toHaveBeenCalledWith("get_person_card", { p_person_id: "person-1" });
  });

  it("routes edits, forgetting and the preference through their RPCs", async () => {
    const update = context(card);
    expect(
      await updateOwnedPersonCard(update.data, {
        personId: "person-1",
        displayName: "Marta",
        relation: null,
        userNote: "n",
      }),
    ).toEqual({ ok: true, data: card });
    expect(update.rpc).toHaveBeenCalledWith("update_person_card", {
      p_person_id: "person-1",
      p_display_name: "Marta",
      p_relation: null,
      p_user_note: "n",
    });
    const forget = context(true);
    expect(await forgetOwnedPerson(forget.data, "person-1")).toEqual({ ok: true, data: true });
    expect(forget.rpc).toHaveBeenCalledWith("forget_person", { p_person_id: "person-1" });
    const enable = context(true);
    expect(await setOwnedPeopleMemoryEnabled(enable.data, false)).toEqual({ ok: true, data: true });
    expect(enable.rpc).toHaveBeenCalledWith("set_people_memory_enabled", { p_enabled: false });
  });

  it("treats a missing preference row as enabled and a read error as a failure", async () => {
    expect(await readOwnedPeopleMemoryEnabled(tableContext(null).data)).toEqual({ ok: true, data: true });
    expect(await readOwnedPeopleMemoryEnabled(tableContext({ people_memory_enabled: false }).data)).toEqual({
      ok: true,
      data: false,
    });
    expect(await readOwnedPeopleMemoryEnabled(tableContext(null, { code: "x" }).data)).toMatchObject({ ok: false });
  });

  it("reads the pinned memory and brief together and omits an absent brief", async () => {
    const session = { id: "s", avatarId: "cbt-guide" } as const;
    const withBrief = tableContext({ summary_text: "Pamięć", people_brief_text: "- Marta" });
    expect(await getOwnedSessionPinnedContext(withBrief.data, session)).toEqual({
      ok: true,
      data: { avatarMemory: "Pamięć", peopleBrief: "- Marta" },
    });
    expect(withBrief.builder.select).toHaveBeenCalledWith("summary_text,people_brief_text");
    expect(
      await getOwnedSessionPinnedContext(tableContext({ summary_text: "", people_brief_text: null }).data, session),
    ).toEqual({
      ok: true,
      data: { avatarMemory: "" },
    });
    expect(await getOwnedSessionPinnedContext(tableContext(null).data, session)).toMatchObject({
      ok: false,
      error: { code: "read_failed" },
    });
  });
});
