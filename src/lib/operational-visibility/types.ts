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
  "auth.password_update",
  "avatar.fetch",
  "avatar.save",
  "route.protected_redirect",
  "session.start_attempted",
  "session.safety_evaluated",
  "session.ai_provider_failed",
  "session.time_limit_reached",
  "session.completed",
] as const;

export type OperationalEventName = (typeof OPERATIONAL_EVENT_NAMES)[number];

export const OPERATIONAL_EVENT_LEVELS = ["info", "warn", "error"] as const;
export type OperationalEventLevel = (typeof OPERATIONAL_EVENT_LEVELS)[number];

export const OPERATIONAL_EVENT_OUTCOMES = ["success", "failure", "redirected", "blocked", "skipped"] as const;
export type OperationalEventOutcome = (typeof OPERATIONAL_EVENT_OUTCOMES)[number];

export const OPERATIONAL_EVENT_PROVIDERS = ["supabase", "google", "openrouter"] as const;
export type OperationalEventProvider = (typeof OPERATIONAL_EVENT_PROVIDERS)[number];

export const OPERATIONAL_RISK_STATES = ["normal", "caution", "crisis"] as const;
export type OperationalRiskState = (typeof OPERATIONAL_RISK_STATES)[number];

export const OPERATIONAL_SAFETY_ACTIONS = ["allow", "allow_with_constraints", "hard_stop", "fail_closed"] as const;
export type OperationalSafetyAction = (typeof OPERATIONAL_SAFETY_ACTIONS)[number];

export type ProtectedRouteReasonCode = "missing_auth";

export type OperationalDiagnosticReasonCode = "private_field_denied" | "invalid_event_payload" | "logger_unavailable";

export type OperationalSessionReasonCode =
  | SessionSafetyReasonCode
  | "session_start_failed"
  | "provider_timeout"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "time_limit_reached"
  | "completed"
  | "interrupted";

export type OperationalReasonCode =
  | AuthErrorCode
  | AvatarChoiceErrorCode
  | ProtectedRouteReasonCode
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
  deploymentTarget?: string;
  schemaVersion?: typeof OPERATIONAL_EVENT_SCHEMA_VERSION;
}

export type SanitizedOperationalEvent = Partial<OperationalEvent> & {
  schemaVersion: typeof OPERATIONAL_EVENT_SCHEMA_VERSION;
};
