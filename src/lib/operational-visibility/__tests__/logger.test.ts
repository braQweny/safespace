import { afterEach, describe, expect, it, vi } from "vitest";
import { logOperationalEvent } from "../logger";

describe("logOperationalEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits sanitized structured objects only", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {
      return undefined;
    });

    logOperationalEvent(
      {
        event: "auth.signin",
        level: "info",
        outcome: "success",
        email: "person@example.test",
      },
      {
        requestId: "req-1",
        route: "/auth/signin",
        method: "post",
      },
    );

    expect(consoleLog).toHaveBeenCalledTimes(1);
    expect(consoleLog).toHaveBeenCalledWith({
      event: "auth.signin",
      level: "warn",
      requestId: "req-1",
      route: "/auth/signin",
      method: "POST",
      outcome: "failure",
      reasonCode: "private_field_denied",
      schemaVersion: 1,
    });
    expect(JSON.stringify(consoleLog.mock.calls[0]?.[0])).not.toContain("person@example.test");
  });

  it("swallows logger failures", () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log transport unavailable");
    });

    expect(() => {
      logOperationalEvent({
        event: "avatar.fetch",
        outcome: "success",
      });
    }).not.toThrow();
  });
});
