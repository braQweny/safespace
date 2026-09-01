import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_MESSAGE_CONTEXT_LIMIT,
  MIN_RECENT_MESSAGE_CONTEXT_LIMIT,
  resolveRecentMessageContextLimit,
} from "../context-window";

describe("resolveRecentMessageContextLimit", () => {
  it("keeps the base window for the free trial budget and anything shorter or unknown", () => {
    expect(resolveRecentMessageContextLimit(900)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(300)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(0)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(null)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(undefined)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(Number.NaN)).toBe(MIN_RECENT_MESSAGE_CONTEXT_LIMIT);
  });

  it("scales the window with the session budget and caps it for the premium hour", () => {
    expect(resolveRecentMessageContextLimit(1800)).toBe(16);
    expect(resolveRecentMessageContextLimit(3600)).toBe(MAX_RECENT_MESSAGE_CONTEXT_LIMIT);
    expect(resolveRecentMessageContextLimit(36_000)).toBe(MAX_RECENT_MESSAGE_CONTEXT_LIMIT);
  });
});
