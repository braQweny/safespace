import type { APIContext } from "astro";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext, getOperationalDurationMs } from "@/lib/operational-visibility/request-context";
import {
  buildSessionOpeningFailedEvent,
  buildSessionStartAttemptedEvent,
  type SessionStartReasonCode,
} from "@/lib/operational-visibility/session-events";
import type { OperationalEvent } from "@/lib/operational-visibility/types";
import { readSessionQuota } from "@/lib/session-data/quota";
import { transitionSessionLifecycle } from "@/lib/session-data/repository";
import type {
  SessionDataContext,
  SessionDurationBucketSeconds,
  SessionId,
  SessionQuota,
} from "@/lib/session-data/types";
import { readCurrentAvatarChoice, type CurrentAvatarChoice, type CurrentAvatarChoiceErrorCode } from "./avatar-choice";
import type { SessionMessageViewModel } from "./message-contract";
import { requireSessionRouteAccess, type SessionRouteAccessFailureCode } from "./route-access";
import { createSessionOpeningMessage } from "./session-opening";
import { resolveAboutDifficultyForStart, resolveAboutPersonForStart } from "./session-start-request";
import { toSessionView } from "./session-state";

/**
 * Wspólny szkielet `POST /api/session/start` (próba) i `/start-next`
 * (kolejna rozmowa, pamięć, głos). Trasy składają kroki w swojej kolejności —
 * ta jest nośna (CLAUDE.md: „Account plans…”, „Voice conversations”), więc
 * moduł nie decyduje o niej, tylko daje kroki z identycznymi kodami,
 * przekierowaniami i logiem `session.start_attempted`.
 */

export const SESSION_LIMIT_REDIRECT = "/dashboard?start=limit_reached";
export const START_UNAVAILABLE_REDIRECT = "/dashboard/session?start=unavailable";
export const START_FAILED_REDIRECT = "/dashboard/session?start=failed";

export type SessionStartOutcome = "success" | "failure" | "blocked";

/** Kody, które obie trasy zwracają z kroków wspólnych; resztę trasa dokłada parametrem. */
export type SessionStartSharedFailureCode =
  | SessionRouteAccessFailureCode
  | CurrentAvatarChoiceErrorCode
  | "validation_failed"
  | "read_failed"
  | "session_quota_unavailable"
  | "session_limit_reached"
  | "session_start_failed";

export type SessionStartStep<T> = { ok: true; data: T } | { ok: false; response: Response };

export function wantsJson(request: Request) {
  return request.headers.get("Accept")?.toLowerCase().includes("application/json") ?? false;
}

export function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

export function getAccountAccessRedirect(code: SessionRouteAccessFailureCode) {
  return code === "account_blocked" ? "/account/blocked" : "/account/blocked?state=unavailable";
}

export interface SessionStartResponder<Code extends string> {
  /** `session.start_attempted` ze statusem; porażka bez kodu dostaje `session_start_failed`. */
  logAttempt(outcome: SessionStartOutcome, status: number, reasonCode?: SessionStartReasonCode): void;
  logEvent(event: OperationalEvent): void;
  durationMs(): number | undefined;
  json(body: Record<string, unknown>, status: number): Response;
  redirect(path: string): Response;
  /** Log próby, potem `{ ok: false, code, redirectTo }` dla fetch albo 303 dla natywnego formularza. */
  fail(
    outcome: Exclude<SessionStartOutcome, "success">,
    code: Code | SessionStartSharedFailureCode,
    status: number,
    redirectTo: string,
    reasonCode?: SessionStartReasonCode,
  ): Response;
}

export async function createSessionStartResponder<Code extends string = never>(
  context: APIContext,
): Promise<SessionStartResponder<Code>> {
  // Zegar rusza przed budową kontekstu logu, więc czas obejmuje całe żądanie.
  const startedAtMs = performance.now();
  const operationalContext = await buildOperationalRequestContext(context);
  const durationMs = () => getOperationalDurationMs(startedAtMs);
  const logEvent = (event: OperationalEvent) => {
    logOperationalEvent(event, operationalContext);
  };
  const logAttempt = (
    outcome: SessionStartOutcome,
    status: number,
    reasonCode: SessionStartReasonCode = "session_start_failed",
  ) => {
    logEvent({
      ...buildSessionStartAttemptedEvent({
        outcome,
        reasonCode: outcome === "success" ? undefined : reasonCode,
        durationMs: durationMs(),
      }),
      status,
    });
  };
  const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });
  const redirect = (path: string) => context.redirect(path, 303);

  return {
    logAttempt,
    logEvent,
    durationMs,
    json,
    redirect,
    fail(outcome, code, status, redirectTo, reasonCode) {
      logAttempt(outcome, status, reasonCode);

      return wantsJson(context.request) ? json({ ok: false, code, redirectTo }, status) : redirect(redirectTo);
    },
  };
}

export interface SessionStartScope<Code extends string> {
  context: APIContext;
  respond: SessionStartResponder<Code>;
  sessionData: SessionDataContext;
  avatarChoice: CurrentAvatarChoice;
}

/** Dostęp (sesja, blokada konta), potem zapisana perspektywa — zawsze pierwsze i w tej kolejności. */
export async function beginSessionStart<Code extends string = never>(
  context: APIContext,
): Promise<SessionStartStep<SessionStartScope<Code>>> {
  const respond = await createSessionStartResponder<Code>(context);
  const access = await requireSessionRouteAccess(context);

  if (!access.ok) {
    const { code, status, source } = access.error;
    const fromSessionContext = source === "session_context";

    return {
      ok: false,
      response: respond.fail(
        fromSessionContext ? "failure" : "blocked",
        code,
        status,
        fromSessionContext ? "/auth/signin" : getAccountAccessRedirect(code),
      ),
    };
  }

  const avatarChoice = await readCurrentAvatarChoice(access.data);

  if (!avatarChoice.ok) {
    const status = avatarChoice.error.code === "missing_avatar" ? 409 : 503;

    return { ok: false, response: respond.fail("blocked", avatarChoice.error.code, status, "/dashboard/avatar") };
  }

  return { ok: true, data: { context, respond, sessionData: access.data, avatarChoice: avatarChoice.data } };
}

/**
 * Karta osoby i trudność z mapy: obie muszą należeć do właściciela i do tej
 * perspektywy (cudza albo nieistniejąca → 400, błąd odczytu → 503).
 */
export async function resolveSessionStartTopics<Code extends string>(
  scope: SessionStartScope<Code>,
  request: { aboutPersonId: string | null; aboutDifficultyId: string | null },
): Promise<SessionStartStep<{ aboutPersonId: string | null; aboutDifficultyId: string | null }>> {
  const avatarId = scope.avatarChoice.selected.avatarId;
  const failTopic = (code: "validation_failed" | "read_failed") =>
    scope.respond.fail("failure", code, code === "validation_failed" ? 400 : 503, "/dashboard");
  const aboutPerson = await resolveAboutPersonForStart(scope.sessionData, request.aboutPersonId, avatarId);

  if (!aboutPerson.ok) {
    return { ok: false, response: failTopic(aboutPerson.code) };
  }

  const aboutDifficulty = await resolveAboutDifficultyForStart(scope.sessionData, request.aboutDifficultyId, avatarId);

  if (!aboutDifficulty.ok) {
    return { ok: false, response: failTopic(aboutDifficulty.code) };
  }

  return {
    ok: true,
    data: { aboutPersonId: aboutPerson.aboutPersonId, aboutDifficultyId: aboutDifficulty.aboutDifficultyId },
  };
}

/**
 * Pre-flight only: the insert trigger on therapy_sessions is the real gate,
 * this keeps the response honest without a round trip that is bound to fail.
 * Both routes count against the same allowance — a free account gets
 * FREE_PLAN_SESSION_LIMIT sessions in total, not per route.
 */
export async function readSessionStartQuota<Code extends string>(
  scope: SessionStartScope<Code>,
): Promise<SessionStartStep<SessionQuota>> {
  const quota = await readSessionQuota(scope.sessionData);

  if (!quota.ok) {
    return {
      ok: false,
      response: scope.respond.fail("failure", "session_quota_unavailable", 503, START_UNAVAILABLE_REDIRECT),
    };
  }

  return { ok: true, data: quota.data };
}

/** Wyczerpany limit planu bezpłatnego: w pre-flighcie i jako wynik wyścigu z triggerem. */
export function failSessionLimitReached<Code extends string>(respond: SessionStartResponder<Code>) {
  return respond.fail("blocked", "session_limit_reached", 403, SESSION_LIMIT_REDIRECT, "session_limit_reached");
}

export interface SessionStartWindow {
  startedAt: Date;
  startedAtIso: string;
  expiresAtIso: string;
}

export function openSessionStartWindow(durationSeconds: number, startedAt = new Date()): SessionStartWindow {
  return {
    startedAt,
    startedAtIso: startedAt.toISOString(),
    expiresAtIso: addSeconds(startedAt, durationSeconds).toISOString(),
  };
}

export interface CompleteSessionStartOptions {
  sessionId: SessionId;
  window: SessionStartWindow;
  durationBucketSeconds: SessionDurationBucketSeconds;
  /** Rozmowa głosowa otwiera się sama po połączeniu, więc nie dostaje wiadomości otwierającej. */
  withOpening: boolean;
  successRedirect: string;
}

/**
 * Aktywacja utworzonego wiersza, log sukcesu, otwarcie i odpowiedź 201 (albo
 * 303 dla formularza). Otwarcie powstaje i zapisuje się przed odpowiedzią, żeby
 * kompozytor nie ścigał się z nim; jego porażka daje rozmowę bez otwarcia.
 */
export async function completeSessionStart<Code extends string>(
  scope: SessionStartScope<Code>,
  options: CompleteSessionStartOptions,
): Promise<Response> {
  const { respond } = scope;
  const activeSession = await transitionSessionLifecycle(scope.sessionData, {
    sessionId: options.sessionId,
    nextStatus: "active",
    startedAt: options.window.startedAtIso,
    expiresAt: options.window.expiresAtIso,
    durationBucketSeconds: options.durationBucketSeconds,
  });

  if (!activeSession.ok) {
    return respond.fail("failure", "session_start_failed", 500, START_FAILED_REDIRECT);
  }

  respond.logAttempt("success", 201);

  const opening = options.withOpening
    ? await createSessionOpeningMessage(scope.sessionData, activeSession.data, {
        locale: getRequestLocale(scope.context.locals),
      })
    : { ok: true as const, message: null };

  if (!opening.ok) {
    respond.logEvent(buildSessionOpeningFailedEvent({ reasonCode: opening.failure, durationMs: respond.durationMs() }));
  }

  const openingMessage: SessionMessageViewModel | undefined =
    opening.ok && opening.message ? opening.message : undefined;

  if (!wantsJson(scope.context.request)) {
    return respond.redirect(options.successRedirect);
  }

  return respond.json(
    {
      ok: true,
      session: toSessionView(activeSession.data, options.window.startedAt),
      ...(openingMessage ? { openingMessage } : {}),
    },
    201,
  );
}
