import { afterEach, describe, expect, it, vi } from "vitest";
import { startAvatarMemoryPreparation } from "../useAvatarMemoryPreparation";
import { startPeopleMemoryPreparation } from "../usePeopleMemoryPreparation";

const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const preparing = (updated = true) =>
  Response.json({ ok: true, type: "people_memory_preparing", updated }, { status: 202 });
const ready = (updated = false) => Response.json({ ok: true, type: "people_memory_ready", updated });
const paused = () => Response.json({ ok: true, type: "people_memory_paused", updated: false });

afterEach(() => vi.unstubAllGlobals());

describe("background people cards", () => {
  it("walks every remaining batch, refreshing after each saved one, and stops when ready", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(preparing())
      .mockResolvedValueOnce(preparing(false))
      .mockResolvedValueOnce(ready(true));
    vi.stubGlobal("fetch", fetch);
    const onUpdated = vi.fn();
    await startPeopleMemoryPreparation(avatar, onUpdated).done;
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe("/api/session/prepare-people");
      expect(init).toMatchObject({ method: "POST", body: JSON.stringify(avatar) });
    }
    expect(onUpdated).toHaveBeenCalledTimes(2);
  });

  it("stops on a paused provider, a 404 flag or throttling without refreshing", async () => {
    for (const response of [
      paused(),
      Response.json({ ok: false }, { status: 404 }),
      Response.json({}, { status: 429 }),
    ]) {
      const fetch = vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetch);
      const onUpdated = vi.fn();
      await startPeopleMemoryPreparation(avatar, onUpdated).done;
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(onUpdated).not.toHaveBeenCalled();
    }
  });

  it("waits for an in-flight memory batch of the same perspective before asking for cards", async () => {
    let finishMemory!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finishMemory = resolve;
        }),
      )
      .mockResolvedValue(ready());
    vi.stubGlobal("fetch", fetch);
    const memory = startAvatarMemoryPreparation(avatar);
    memory.stop();
    const people = startPeopleMemoryPreparation(avatar, vi.fn());
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(1);
    finishMemory(Response.json({ ok: true, type: "avatar_memory_ready" }));
    await Promise.all([memory.done, people.done]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe("/api/session/prepare-people");
  });

  it("does not start another batch after stop, and an explicit start never has to wait for it", async () => {
    let finishPeople!: (response: Response) => void;
    const fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finishPeople = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const task = startPeopleMemoryPreparation(avatar, vi.fn());
    await Promise.resolve();
    task.stop();
    finishPeople(preparing());
    await task.done;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
