import type { APIContext } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, sessionDataError } from "@/lib/session-data/errors";
import type { SessionDataContext, SessionMetadata } from "@/lib/session-data/types";
import { MODALITY_CATALOG, toSelectedModalityAvatar } from "@/lib/modality-catalog";
import type { CurrentAvatarChoice } from "../avatar-choice";
import type { SessionMessageViewModel } from "../message-contract";

const getSessionDataContext = vi.fn();
const requireActiveAccountAccess = vi.fn();
const readCurrentAvatarChoice = vi.fn();
const readSessionQuota = vi.fn();
const transitionSessionLifecycle = vi.fn();
const getOwnedPersonCard = vi.fn();
const getOwnedDifficultyCard = vi.fn();
const logOperationalEvent = vi.fn();
const createSessionOpeningMessage = vi.fn();

vi.mock("@/lib/session-data/auth", () => ({ getSessionDataContext }));
vi.mock("@/lib/admin/account-access", () => ({ requireActiveAccountAccess }));
vi.mock("@/lib/session-flow/avatar-choice", () => ({ readCurrentAvatarChoice }));
vi.mock("@/lib/session-data/quota", () => ({ readSessionQuota, readTrialAvailability: vi.fn() }));
vi.mock("@/lib/session-data/repository", () => ({
  transitionSessionLifecycle,
  getOwnedPersonCard,
  getOwnedDifficultyCard,
  getOwnedSessionMetadata: vi.fn(),
  listOwnedActiveSessionMetadata: vi.fn(),
  listOwnedSessionMessages: vi.fn(),
}));
vi.mock("@/lib/operational-visibility/request-context", () => ({
  buildOperationalRequestContext: vi.fn(() => Promise.resolve({ requestId: "req-1" })),
  getOperationalDurationMs: () => 7,
}));
vi.mock("@/lib/operational-visibility/logger", () => ({ logOperationalEvent }));
vi.mock("@/lib/session-flow/session-opening", () => ({ createSessionOpeningMessage }));

const {
  SESSION_LIMIT_REDIRECT,
  START_FAILED_REDIRECT,
  START_UNAVAILABLE_REDIRECT,
  beginSessionStart,
  completeSessionStart,
  createSessionStartResponder,
  failSessionLimitReached,
  getAccountAccessRedirect,
  openSessionStartWindow,
  readSessionStartQuota,
  resolveSessionStartTopics,
  wantsJson,
} = await import("../session-start-route");

const contextData = { user: { id: "user-1" } } as SessionDataContext;
const CBT = MODALITY_CATALOG[1];
const avatarChoice = { modality: CBT, selected: toSelectedModalityAvatar(CBT) } as unknown as CurrentAvatarChoice;
const PERSON_ID = "7b0e2a4c-1d3f-4e5a-9b6c-8d7e6f5a4b3c";
const DIFFICULTY_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const activeSession: SessionMetadata = {
  id: "session-1",
  userId: "user-1",
  modalityId: "cbt",
  avatarId: "cbt-guide",
  status: "active",
  startedAt: "2026-06-07T10:00:00.000Z",
  endedAt: null,
  expiresAt: "2026-06-07T10:15:00.000Z",
  deletedAt: null,
  deletionReasonCode: null,
  isTrial: false,
  trialClaimId: null,
  durationBucketSeconds: 900,
  usesApprovedContext: true,
  createdAt: "2026-06-07T10:00:00.000Z",
  updatedAt: "2026-06-07T10:00:00.000Z",
};

const openingMessage: SessionMessageViewModel = {
  id: "message-1",
  role: "assistant",
  sequenceIndex: 1,
  content: "Dzień dobry.",
  createdAt: "2026-06-07T10:00:01.000Z",
};

function createContext(json = true) {
  return {
    request: new Request("https://safespace.local/api/session/start-next", {
      method: "POST",
      headers: json ? { Accept: "application/json" } : {},
    }),
    cookies: {},
    locals: { user: { id: "user-1" }, requestId: "req-1", locale: "en" },
    url: new URL("https://safespace.local/api/session/start-next"),
    redirect: vi.fn(
      (path: string, status?: number) => new Response(null, { status: status ?? 302, headers: { Location: path } }),
    ),
  } as unknown as APIContext;
}

async function createScope(json = true) {
  const context = createContext(json);

  return {
    context,
    respond: await createSessionStartResponder<"trial_unavailable">(context),
    sessionData: contextData,
    avatarChoice,
  };
}

function loggedEvents() {
  return logOperationalEvent.mock.calls.map(([event]) => event as Record<string, unknown>);
}

describe("session start route helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionDataContext.mockReturnValue(ok(contextData));
    requireActiveAccountAccess.mockResolvedValue({ ok: true, data: { userId: "user-1", status: "active" } });
    readCurrentAvatarChoice.mockResolvedValue(ok(avatarChoice));
  });

  it("tells a fetch client from a native form and maps account access to its page", () => {
    expect(wantsJson(new Request("https://x.test", { headers: { Accept: "Application/JSON" } }))).toBe(true);
    expect(wantsJson(new Request("https://x.test"))).toBe(false);
    expect(getAccountAccessRedirect("account_blocked")).toBe("/account/blocked");
    expect(getAccountAccessRedirect("account_access_unavailable")).toBe("/account/blocked?state=unavailable");
  });

  it("pins the start window to one clock reading", () => {
    const window = openSessionStartWindow(900, new Date("2026-06-07T10:00:00.000Z"));

    expect(window).toEqual({
      startedAt: new Date("2026-06-07T10:00:00.000Z"),
      startedAtIso: "2026-06-07T10:00:00.000Z",
      expiresAtIso: "2026-06-07T10:15:00.000Z",
    });
  });

  it("answers a failure as JSON or as a 303, logging the attempt with the default reason", async () => {
    const jsonScope = await createScope();
    const jsonResponse = jsonScope.respond.fail("failure", "trial_unavailable", 503, START_UNAVAILABLE_REDIRECT);

    expect(jsonResponse.status).toBe(503);
    await expect(jsonResponse.json()).resolves.toEqual({
      ok: false,
      code: "trial_unavailable",
      redirectTo: START_UNAVAILABLE_REDIRECT,
    });

    const formScope = await createScope(false);
    const formResponse = formScope.respond.fail("blocked", "validation_failed", 400, "/dashboard");

    expect(formResponse.status).toBe(303);
    expect(formResponse.headers.get("Location")).toBe("/dashboard");
    expect(loggedEvents()).toEqual([
      expect.objectContaining({
        event: "session.start_attempted",
        outcome: "failure",
        status: 503,
        reasonCode: "session_start_failed",
        durationMs: 7,
      }),
      expect.objectContaining({ outcome: "blocked", status: 400, reasonCode: "session_start_failed" }),
    ]);
    expect(logOperationalEvent.mock.calls[0]?.[1]).toEqual({ requestId: "req-1" });
  });

  it("keeps an explicit reason code and drops it on success", async () => {
    const { respond } = await createScope();
    const limited = failSessionLimitReached(respond);

    expect(limited.status).toBe(403);
    await expect(limited.json()).resolves.toMatchObject({
      code: "session_limit_reached",
      redirectTo: SESSION_LIMIT_REDIRECT,
    });
    respond.logAttempt("success", 201);

    expect(loggedEvents()[0]).toMatchObject({ outcome: "blocked", reasonCode: "session_limit_reached" });
    expect(loggedEvents()[1]).toMatchObject({ outcome: "success", status: 201 });
    expect(loggedEvents()[1]).not.toHaveProperty("reasonCode");
  });

  it("checks access before the avatar and sends each failure to its own page", async () => {
    getSessionDataContext.mockReturnValue(sessionDataError("missing_auth"));
    const unauthenticated = await beginSessionStart(createContext());

    expect(unauthenticated.ok).toBe(false);
    expect(unauthenticated.ok ? null : unauthenticated.response.status).toBe(401);
    expect(readCurrentAvatarChoice).not.toHaveBeenCalled();

    getSessionDataContext.mockReturnValue(ok(contextData));
    readCurrentAvatarChoice.mockResolvedValue({ ok: false, error: { code: "missing_avatar" } });
    const missingAvatar = await beginSessionStart(createContext(false));

    expect(missingAvatar.ok ? null : missingAvatar.response.headers.get("Location")).toBe("/dashboard/avatar");
    expect(missingAvatar.ok ? null : missingAvatar.response.status).toBe(303);
    expect(loggedEvents().map((event) => [event.outcome, event.status])).toEqual([
      ["failure", 401],
      ["blocked", 409],
    ]);
  });

  it("hands the route the owner's data context and saved perspective", async () => {
    const start = await beginSessionStart(createContext());

    expect(start.ok).toBe(true);
    expect(start.ok ? start.data.sessionData : null).toBe(contextData);
    expect(start.ok ? start.data.avatarChoice : null).toBe(avatarChoice);
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it("validates topic cards against the owner and the perspective", async () => {
    const scope = await createScope();

    await expect(resolveSessionStartTopics(scope, { aboutPersonId: null, aboutDifficultyId: null })).resolves.toEqual({
      ok: true,
      data: { aboutPersonId: null, aboutDifficultyId: null },
    });
    expect(getOwnedPersonCard).not.toHaveBeenCalled();

    getOwnedPersonCard.mockResolvedValue(sessionDataError("read_failed"));
    const unreadable = await resolveSessionStartTopics(scope, { aboutPersonId: PERSON_ID, aboutDifficultyId: null });

    expect(unreadable.ok ? null : unreadable.response.status).toBe(503);

    getOwnedPersonCard.mockResolvedValue(ok({ id: PERSON_ID, avatarId: "cbt-guide" }));
    getOwnedDifficultyCard.mockResolvedValue(ok({ id: DIFFICULTY_ID, avatarId: "systemic-connector" }));
    const foreign = await resolveSessionStartTopics(scope, {
      aboutPersonId: PERSON_ID,
      aboutDifficultyId: DIFFICULTY_ID,
    });

    expect(foreign.ok ? null : foreign.response.status).toBe(400);
    await expect(foreign.ok ? null : foreign.response.json()).resolves.toMatchObject({
      code: "validation_failed",
      redirectTo: "/dashboard",
    });

    getOwnedDifficultyCard.mockResolvedValue(ok({ id: DIFFICULTY_ID, avatarId: "cbt-guide" }));
    await expect(
      resolveSessionStartTopics(scope, { aboutPersonId: PERSON_ID, aboutDifficultyId: DIFFICULTY_ID }),
    ).resolves.toEqual({ ok: true, data: { aboutPersonId: PERSON_ID, aboutDifficultyId: DIFFICULTY_ID } });
  });

  it("refuses the start when the allowance cannot be read", async () => {
    const scope = await createScope();
    readSessionQuota.mockResolvedValue(sessionDataError("read_failed"));
    const quota = await readSessionStartQuota(scope);

    expect(quota.ok ? null : quota.response.status).toBe(503);
    await expect(quota.ok ? null : quota.response.json()).resolves.toMatchObject({
      code: "session_quota_unavailable",
      redirectTo: START_UNAVAILABLE_REDIRECT,
    });
  });

  it("activates the session, logs success before the opening and returns it with the session", async () => {
    const scope = await createScope();
    transitionSessionLifecycle.mockResolvedValue(ok(activeSession));
    createSessionOpeningMessage.mockResolvedValue({ ok: true, message: openingMessage });
    const window = openSessionStartWindow(900, new Date("2026-06-07T10:00:00.000Z"));

    const response = await completeSessionStart(scope, {
      sessionId: "session-1",
      window,
      durationBucketSeconds: 900,
      withOpening: true,
      successRedirect: "/dashboard/session?started=next",
    });

    expect(transitionSessionLifecycle).toHaveBeenCalledWith(contextData, {
      sessionId: "session-1",
      nextStatus: "active",
      startedAt: "2026-06-07T10:00:00.000Z",
      expiresAt: "2026-06-07T10:15:00.000Z",
      durationBucketSeconds: 900,
    });
    expect(createSessionOpeningMessage).toHaveBeenCalledWith(contextData, activeSession, { locale: "en" });
    expect(logOperationalEvent.mock.invocationCallOrder[0]).toBeLessThan(
      createSessionOpeningMessage.mock.invocationCallOrder[0] ?? 0,
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      session: { id: "session-1", status: "active" },
      openingMessage,
    });
  });

  it("skips the opening for voice, logs a failed opening and redirects a native form", async () => {
    transitionSessionLifecycle.mockResolvedValue(ok(activeSession));
    const window = openSessionStartWindow(600, new Date("2026-06-07T10:00:00.000Z"));
    const options = { sessionId: "session-1", window, durationBucketSeconds: 600 as const };

    const voice = await completeSessionStart(await createScope(), {
      ...options,
      withOpening: false,
      successRedirect: "/dashboard/session?started=next",
    });

    expect(createSessionOpeningMessage).not.toHaveBeenCalled();
    await expect(voice.json()).resolves.not.toHaveProperty("openingMessage");

    createSessionOpeningMessage.mockResolvedValue({ ok: false, failure: "opening_provider_failed" });
    const form = await completeSessionStart(await createScope(false), {
      ...options,
      withOpening: true,
      successRedirect: "/dashboard/session?started=1",
    });

    expect(form.status).toBe(303);
    expect(form.headers.get("Location")).toBe("/dashboard/session?started=1");
    expect(loggedEvents().at(-1)).toMatchObject({
      event: "session.opening_failed",
      reasonCode: "opening_provider_failed",
    });
  });

  it("reports a failed activation without logging success", async () => {
    transitionSessionLifecycle.mockResolvedValue(sessionDataError("invalid_lifecycle_transition"));

    const response = await completeSessionStart(await createScope(), {
      sessionId: "session-1",
      window: openSessionStartWindow(900),
      durationBucketSeconds: 900,
      withOpening: true,
      successRedirect: "/dashboard/session?started=1",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      code: "session_start_failed",
      redirectTo: START_FAILED_REDIRECT,
    });
    expect(loggedEvents()).toEqual([expect.objectContaining({ outcome: "failure", status: 500 })]);
    expect(createSessionOpeningMessage).not.toHaveBeenCalled();
  });
});
