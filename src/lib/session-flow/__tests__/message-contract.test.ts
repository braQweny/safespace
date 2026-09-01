import { describe, expect, it } from "vitest";
import { parseSendSessionMessageRequest, SESSION_MESSAGE_MAX_CHARS } from "../message-contract";

const SESSION_ID = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

function createRequest(body: unknown) {
  return new Request("https://safespace.local/api/session/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("parseSendSessionMessageRequest", () => {
  it("accepts a uuid session id and a trimmed message", async () => {
    await expect(
      parseSendSessionMessageRequest(createRequest({ sessionId: ` ${SESSION_ID} `, message: "  Czesc.  " })),
    ).resolves.toEqual({
      sessionId: SESSION_ID,
      message: "Czesc.",
    });
  });

  it("rejects session ids that are not uuids, like every other session route", async () => {
    for (const sessionId of ["session-1", "", 42, null, `${SESSION_ID}x`]) {
      await expect(parseSendSessionMessageRequest(createRequest({ sessionId, message: "Czesc." }))).resolves.toBeNull();
    }
  });

  it("rejects empty, oversized and malformed bodies", async () => {
    await expect(
      parseSendSessionMessageRequest(createRequest({ sessionId: SESSION_ID, message: "   " })),
    ).resolves.toBeNull();
    await expect(
      parseSendSessionMessageRequest(
        createRequest({ sessionId: SESSION_ID, message: "x".repeat(SESSION_MESSAGE_MAX_CHARS + 1) }),
      ),
    ).resolves.toBeNull();
    await expect(parseSendSessionMessageRequest(createRequest("not json"))).resolves.toBeNull();
    await expect(parseSendSessionMessageRequest(createRequest([SESSION_ID]))).resolves.toBeNull();
  });
});
