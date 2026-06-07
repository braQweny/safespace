import { describe, expect, it, vi } from "vitest";
import { readCurrentAvatarChoice, type AvatarChoiceRepository } from "../avatar-choice";
import type { SessionDataContext } from "@/lib/session-data/types";

const context = {
  user: {
    id: "user-1",
  },
} as SessionDataContext;

function createRepository(row: unknown): AvatarChoiceRepository {
  return {
    readCurrentAvatarChoiceRow: vi.fn(() => Promise.resolve(row as never)),
  };
}

describe("readCurrentAvatarChoice", () => {
  it("returns the selected catalog avatar for a valid saved choice", async () => {
    const result = await readCurrentAvatarChoice(
      context,
      createRepository({
        modality_id: "cbt",
        avatar_id: "cbt-guide",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        selected: {
          modalityId: "cbt",
          avatarId: "cbt-guide",
          avatarName: "Marek, praktyczny przewodnik",
        },
      },
    });
  });

  it("returns missing_avatar when no choice exists", async () => {
    await expect(readCurrentAvatarChoice(context, createRepository(null))).resolves.toEqual({
      ok: false,
      error: {
        code: "missing_avatar",
      },
    });
  });

  it("returns invalid_avatar_choice when the row no longer matches the catalog", async () => {
    await expect(
      readCurrentAvatarChoice(
        context,
        createRepository({
          modality_id: "cbt",
          avatar_id: "integrative-guide",
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_avatar_choice",
      },
    });
  });

  it("maps repository failures to a stable fetch_failed code", async () => {
    const repository: AvatarChoiceRepository = {
      readCurrentAvatarChoiceRow: vi.fn(() => Promise.reject(new Error("raw supabase details"))),
    };

    await expect(readCurrentAvatarChoice(context, repository)).resolves.toEqual({
      ok: false,
      error: {
        code: "fetch_failed",
      },
    });
  });
});
