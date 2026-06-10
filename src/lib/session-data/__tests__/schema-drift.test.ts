import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  SessionAvatarId,
  SessionDeletionReasonCode,
  SessionDurationBucketSeconds,
  SessionLifecycleStatus,
  SessionMessageRole,
  SessionModalityId,
  SessionSummaryStatus,
} from "../types";

// The session-data domain types are hand-maintained on purpose (no Supabase
// typegen — see the subsystem README). This test pins the hand-written enums
// to the check constraints in the boundary migration, so a change on either
// side fails CI instead of silently coercing invalid data at runtime.

const BOUNDARY_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260606120000_create_private_session_data_boundary.sql",
);

const TS_LIFECYCLE_STATUSES = [
  "created",
  "active",
  "completed",
  "expired",
  "interrupted",
  "deleted",
] as const satisfies readonly SessionLifecycleStatus[];

const TS_MESSAGE_ROLES = ["user", "assistant", "system_boundary"] as const satisfies readonly SessionMessageRole[];

const TS_SUMMARY_STATUSES = ["draft", "ready", "stale", "deleted"] as const satisfies readonly SessionSummaryStatus[];

const TS_DELETION_REASON_CODES = [
  "user_request",
  "retention_expired",
  "safety_cleanup",
  "system_cleanup",
] as const satisfies readonly SessionDeletionReasonCode[];

const TS_DURATION_BUCKETS = [0, 300, 900, 1800, 3600] as const satisfies readonly SessionDurationBucketSeconds[];

const TS_MODALITY_IDS = [
  "psychodynamic",
  "cbt",
  "humanistic_experiential",
  "systemic",
  "integrative",
] as const satisfies readonly SessionModalityId[];

const TS_AVATAR_IDS = [
  "psychodynamic-listener",
  "cbt-guide",
  "experiential-companion",
  "systemic-connector",
  "integrative-guide",
] as const satisfies readonly SessionAvatarId[];

// Compile-time exhaustiveness: adding a member to a union without adding it to
// the matching list above turns these assignments into type errors.
type AssertExhaustive<Union extends string | number, Listed extends Union> =
  Exclude<Union, Listed> extends never ? true : never;

const lifecycleCovered: AssertExhaustive<SessionLifecycleStatus, (typeof TS_LIFECYCLE_STATUSES)[number]> = true;
const rolesCovered: AssertExhaustive<SessionMessageRole, (typeof TS_MESSAGE_ROLES)[number]> = true;
const summaryCovered: AssertExhaustive<SessionSummaryStatus, (typeof TS_SUMMARY_STATUSES)[number]> = true;
const deletionCovered: AssertExhaustive<SessionDeletionReasonCode, (typeof TS_DELETION_REASON_CODES)[number]> = true;
const bucketsCovered: AssertExhaustive<SessionDurationBucketSeconds, (typeof TS_DURATION_BUCKETS)[number]> = true;
const modalitiesCovered: AssertExhaustive<SessionModalityId, (typeof TS_MODALITY_IDS)[number]> = true;
const avatarsCovered: AssertExhaustive<SessionAvatarId, (typeof TS_AVATAR_IDS)[number]> = true;

function readBoundaryMigration() {
  return readFileSync(BOUNDARY_MIGRATION_PATH, "utf8");
}

function extractConstraintBody(sql: string, constraintName: string) {
  const constraintIndex = sql.indexOf(`constraint ${constraintName} check`);
  expect(constraintIndex, `constraint ${constraintName} not found in boundary migration`).toBeGreaterThanOrEqual(0);

  const nextConstraintIndex = sql.indexOf("constraint ", constraintIndex + 1);
  return sql.slice(constraintIndex, nextConstraintIndex === -1 ? undefined : nextConstraintIndex);
}

function extractQuotedValues(constraintBody: string) {
  return [...constraintBody.matchAll(/'([a-z0-9_-]+)'/g)].map((match) => match[1]);
}

function extractNumericListValues(constraintBody: string) {
  const inList = /in \(([\d\s,]+)\)/.exec(constraintBody);

  if (!inList) {
    expect.fail("numeric in (...) list not found in constraint");
  }

  return inList[1].split(",").map((value) => Number(value.trim()));
}

describe("session-data domain types vs boundary migration constraints", () => {
  const sql = readBoundaryMigration();

  it("keeps lifecycle statuses in sync", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_status_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_LIFECYCLE_STATUSES));
    expect(lifecycleCovered).toBe(true);
  });

  it("keeps message roles in sync", () => {
    const body = extractConstraintBody(sql, "session_messages_role_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_MESSAGE_ROLES));
    expect(rolesCovered).toBe(true);
  });

  it("keeps summary statuses in sync", () => {
    const body = extractConstraintBody(sql, "session_summaries_status_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_SUMMARY_STATUSES));
    expect(summaryCovered).toBe(true);
  });

  it("keeps deletion reason codes in sync", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_deletion_reason_code_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_DELETION_REASON_CODES));
    expect(deletionCovered).toBe(true);
  });

  it("keeps duration buckets in sync", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_duration_bucket_seconds_check");
    expect(new Set(extractNumericListValues(body))).toEqual(new Set(TS_DURATION_BUCKETS));
    expect(bucketsCovered).toBe(true);
  });

  it("keeps modality ids in sync", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_modality_id_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_MODALITY_IDS));
    expect(modalitiesCovered).toBe(true);
  });

  it("keeps avatar ids in sync", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_avatar_id_check");
    expect(new Set(extractQuotedValues(body))).toEqual(new Set(TS_AVATAR_IDS));
    expect(avatarsCovered).toBe(true);
  });
});
