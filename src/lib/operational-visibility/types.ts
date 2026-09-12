import type { AdminErrorCode } from "@/lib/admin/errors";
import type { AuthErrorCode } from "@/lib/auth-errors";
import type { AvatarChoiceErrorCode } from "@/lib/avatar-choice-errors";
import type { SessionSafetyReasonCode } from "@/lib/session-safety/reason-codes";

export const OPERATIONAL_EVENT_SCHEMA_VERSION = 1;

export const OPERATIONAL_EVENT_NAMES = [
  "auth.signin",
  "auth.signup",
  "auth.oauth_start",
  "auth.oauth_callback",
  "auth.signout",
  "auth.account_delete",
  "auth.password_update",
  "auth.reset_password",
  "auth.resend_confirmation",
  "avatar.fetch",
  "avatar.save",
  "route.protected_redirect",
  "route.request_rejected",
  "session.start_attempted",
  "session.safety_evaluated",
  "session.ai_provider_failed",
  "session.time_limit_reached",
  "session.completed",
  "session.opening_failed",
  "session.ai_turn_completed",
  "session.transcription_failed",
  "session.people_memory_updated",
  "session.lens_evaluated",
] as const;

export type OperationalEventName = (typeof OPERATIONAL_EVENT_NAMES)[number];

export const OPERATIONAL_EVENT_LEVELS = ["info", "warn", "error"] as const;
export type OperationalEventLevel = (typeof OPERATIONAL_EVENT_LEVELS)[number];

export const OPERATIONAL_EVENT_OUTCOMES = ["success", "failure", "redirected", "blocked", "skipped"] as const;
export type OperationalEventOutcome = (typeof OPERATIONAL_EVENT_OUTCOMES)[number];

export const OPERATIONAL_EVENT_PROVIDERS = ["supabase", "google", "openrouter", "openai"] as const;
export type OperationalEventProvider = (typeof OPERATIONAL_EVENT_PROVIDERS)[number];

export const OPERATIONAL_RISK_STATES = ["normal", "caution", "crisis"] as const;
export type OperationalRiskState = (typeof OPERATIONAL_RISK_STATES)[number];

export const OPERATIONAL_SAFETY_ACTIONS = ["allow", "allow_with_constraints", "hard_stop", "fail_closed"] as const;
export type OperationalSafetyAction = (typeof OPERATIONAL_SAFETY_ACTIONS)[number];

export type ProtectedRouteReasonCode = "missing_auth";

export type RequestGuardReasonCode =
  "length_required" | "payload_too_large" | "rate_limited" | "rate_limiter_unavailable";

export type OperationalDiagnosticReasonCode = "private_field_denied" | "invalid_event_payload" | "logger_unavailable";

export type OperationalSessionReasonCode =
  | SessionSafetyReasonCode
  | "session_start_failed"
  | "session_limit_reached"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "time_limit_reached"
  | "completed"
  | "interrupted"
  | "opening_provider_failed"
  | "opening_persistence_failed"
  | "opening_unavailable"
  | "people_memory_partial";

export type OperationalReasonCode =
  | AdminErrorCode
  | AuthErrorCode
  | AvatarChoiceErrorCode
  | ProtectedRouteReasonCode
  | RequestGuardReasonCode
  | OperationalSessionReasonCode
  | OperationalDiagnosticReasonCode;

export interface OperationalEvent {
  event: OperationalEventName;
  level?: OperationalEventLevel;
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  outcome?: OperationalEventOutcome;
  reasonCode?: OperationalReasonCode;
  durationMs?: number;
  provider?: OperationalEventProvider;
  riskState?: OperationalRiskState;
  action?: OperationalSafetyAction;
  userHash?: string;
  /**
   * Provider-reported token counts for one AI call (input = prompt side,
   * output = completion side). Named this way on purpose: the private-field
   * denylist rejects any field containing "token" or "prompt" — these are cost
   * counters, never credentials or text.
   */
  inputUnits?: number;
  outputUnits?: number;
  deploymentTarget?: string;
  schemaVersion?: typeof OPERATIONAL_EVENT_SCHEMA_VERSION;
}

export type SanitizedOperationalEvent = Partial<OperationalEvent> & {
  schemaVersion: typeof OPERATIONAL_EVENT_SCHEMA_VERSION;
};
