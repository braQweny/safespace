import { describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext } from "@/lib/session-data/types";
import type { VoiceObserverStub } from "@/lib/voice/coordinator";
import {
  VOICE_ACCOUNT_ERASE_LIMIT,
  eraseVoiceObservers,
  listVoiceObserversToErase,
  type VoiceAccountErasureDependencies,
} from "../voice-account-erasure";

const context = { user: { id: "user-1" } } as SessionDataContext;
const now = new Date("2026-09-22T12:00:00.000Z");

function stub(erase: () => Promise<void> = () => Promise.resolve()) {
  return { erase: vi.fn(erase) } as unknown as VoiceObserverStub & { erase: ReturnType<typeof vi.fn> };
}

function dependencies(overrides: Partial<VoiceAccountErasureDependencies> = {}): VoiceAccountErasureDependencies {
  return {
    listOwnedVoiceObserverSessionIds: vi.fn(() => Promise.resolve(ok(["s1", "s2"]))),
    getVoiceObserver: vi.fn(() => stub()),
    timeoutMs: 1_000,
    ...overrides,
  };
}

describe("listVoiceObserversToErase", () => {
  it("asks for connected voice conversations from the whole buffer retention window plus a day", async () => {
    const deps = dependencies();

    await expect(listVoiceObserversToErase(context, now, deps)).resolves.toEqual(["s1", "s2"]);
    expect(deps.listOwnedVoiceObserverSessionIds).toHaveBeenCalledWith(
      context,
      "2026-09-14T12:00:00.000Z",
      VOICE_ACCOUNT_ERASE_LIMIT,
    );
  });

  it("returns null instead of throwing when the list cannot be read", async () => {
    await expect(
      listVoiceObserversToErase(
        context,
        now,
        dependencies({
          listOwnedVoiceObserverSessionIds: vi.fn(() => Promise.resolve(sessionDataError("read_failed"))),
        }),
      ),
    ).resolves.toBeNull();
    await expect(
      listVoiceObserversToErase(
        context,
        now,
        dependencies({ listOwnedVoiceObserverSessionIds: vi.fn(() => Promise.reject(new Error("network"))) }),
      ),
    ).resolves.toBeNull();
  });
});

describe("eraseVoiceObservers", () => {
  it("erases every listed observer in one call each", async () => {
    const stubs = new Map([
      ["s1", stub()],
      ["s2", stub()],
    ]);
    const deps = dependencies({ getVoiceObserver: vi.fn((id: string) => stubs.get(id) ?? null) });

    await expect(eraseVoiceObservers(["s1", "s2"], deps)).resolves.toBe(true);
    expect(stubs.get("s1")?.erase).toHaveBeenCalledOnce();
    expect(stubs.get("s2")?.erase).toHaveBeenCalledOnce();
  });

  it("treats nothing to erase and a missing binding as done", async () => {
    const deps = dependencies({ getVoiceObserver: vi.fn(() => null) });

    await expect(eraseVoiceObservers([], deps)).resolves.toBe(true);
    expect(deps.getVoiceObserver).not.toHaveBeenCalled();
    await expect(eraseVoiceObservers(["s1"], deps)).resolves.toBe(true);
  });

  it("reports a failed observer without throwing and still erases the others", async () => {
    const healthy = stub();
    const deps = dependencies({
      getVoiceObserver: vi.fn((id: string) =>
        id === "broken" ? stub(() => Promise.reject(new Error("durable object unreachable"))) : healthy,
      ),
    });

    await expect(eraseVoiceObservers(["broken", "s2"], deps)).resolves.toBe(false);
    expect(healthy.erase).toHaveBeenCalledOnce();

    const lookupFails = dependencies({ getVoiceObserver: vi.fn(() => Promise.reject(new Error("binding"))) });
    await expect(eraseVoiceObservers(["s1"], lookupFails)).resolves.toBe(false);
  });

  it("stops waiting after the timeout so a hanging observer never blocks account deletion", async () => {
    vi.useFakeTimers();

    try {
      const deps = dependencies({
        getVoiceObserver: vi.fn(() => stub(() => new Promise<void>(() => undefined))),
        timeoutMs: 5_000,
      });
      const pending = eraseVoiceObservers(["s1"], deps);
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(pending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
