import { afterEach, describe, expect, it, vi } from "vitest";
import { startAvatarMemoryPreparation } from "../useAvatarMemoryPreparation";

const avatar = { avatarId: "cbt-guide", modalityId: "cbt" } as const;
const preparing = () => Response.json({ ok: true, type: "avatar_memory_preparing" }, { status: 202 });
const ready = () => Response.json({ ok: true, type: "avatar_memory_ready" });

afterEach(() => vi.unstubAllGlobals());

describe("background avatar memory", () => {
  it("prepares all remaining batches without ever calling a session start endpoint", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(preparing()).mockResolvedValueOnce(ready());
    vi.stubGlobal("fetch", fetch);
    await startAvatarMemoryPreparation(avatar).done;
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe("/api/session/prepare-memory");
      expect(init).toMatchObject({ method: "POST", body: JSON.stringify(avatar) });
    }
  });

  it("waits for an in-flight batch to save before handing over to an explicit start", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const task = startAvatarMemoryPreparation(avatar);
    task.stop();
    const onHandover = vi.fn();
    const handover = task.done.then(onHandover);
    await Promise.resolve();
    expect(onHandover).not.toHaveBeenCalled();
    finish(preparing());
    await handover;
    expect(onHandover).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shares in-flight work across remounts but checks again after it finishes", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValue(ready());
    vi.stubGlobal("fetch", fetch);
    const first = startAvatarMemoryPreparation(avatar);
    first.stop();
    const second = startAvatarMemoryPreparation(avatar);
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(ready());
    await Promise.all([first.done, second.done]);
    await startAvatarMemoryPreparation(avatar).done;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps different avatars separate", async () => {
    const fetch = vi.fn().mockResolvedValue(ready());
    vi.stubGlobal("fetch", fetch);
    await Promise.all([
      startAvatarMemoryPreparation(avatar).done,
      startAvatarMemoryPreparation({ avatarId: "psychodynamic-listener", modalityId: "psychodynamic" }).done,
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 503])("stops on HTTP %s instead of retrying indefinitely", async (status) => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: false }, { status }));
    vi.stubGlobal("fetch", fetch);
    await startAvatarMemoryPreparation(avatar).done;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops quietly on a network failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    await startAvatarMemoryPreparation(avatar).done;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
