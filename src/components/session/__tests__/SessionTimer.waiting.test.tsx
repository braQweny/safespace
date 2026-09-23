// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionTimer from "../SessionTimer";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  useLocale: () => "pl",
}));

/*
 * A voice conversation waiting for its first audio connection shows its full
 * length without counting down, but the row still expires at its original
 * deadline on the server — so the timer keeps watching it and reports it.
 */
describe("SessionTimer while waiting for the first connection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T18:45:48.000Z"));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the label still and still reports the original deadline, then counts down once connected", () => {
    const onExpired = vi.fn();
    const { rerender } = render(
      <SessionTimer
        expiresAt="2026-09-23T18:45:50.000Z"
        initialRemainingSeconds={2}
        totalSeconds={600}
        onExpired={onExpired}
        waitingLabel="czeka na mikrofon"
      />,
    );

    expect(screen.getByText("czeka na mikrofon", { exact: false }).textContent).toBe("10 min · czeka na mikrofon");

    act(() => {
      vi.advanceTimersByTime(3_000);
    });

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("timer")).toBeNull();

    // The first connection moved the window: the same timer now counts down the full length.
    rerender(
      <SessionTimer
        expiresAt="2026-09-23T18:55:51.000Z"
        initialRemainingSeconds={600}
        totalSeconds={600}
        onExpired={onExpired}
        waitingLabel={null}
      />,
    );

    expect(screen.getByRole("timer").textContent).toContain("ok. 10 min");
  });
});
