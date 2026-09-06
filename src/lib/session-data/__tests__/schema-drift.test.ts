import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_PLAN_SESSION_LIMIT_SQLSTATE } from "../errors";
import { FREE_PLAN_SESSION_LIMIT } from "../quota";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { FREE_TRIAL_DURATION_SECONDS, PREMIUM_SESSION_DURATION_SECONDS } from "@/lib/session-flow/session-budget";
import {
  PEOPLE_BATCH_MAX_CHARS,
  PEOPLE_BATCH_MAX_MESSAGES,
  PEOPLE_BATCH_MIN_CHARS,
  PEOPLE_BRIEF_MAX_CHARS,
  PEOPLE_BRIEF_MAX_FACTS,
  PEOPLE_BRIEF_MAX_PERSONS,
  PEOPLE_FACT_KINDS,
  PEOPLE_FACT_MAX_CHARS,
  PEOPLE_MAX_FACTS_PER_PERSON,
  PEOPLE_MAX_PERSONS,
  PEOPLE_NAME_MAX_CHARS,
  PEOPLE_NOTE_MAX_CHARS,
  PEOPLE_RELATION_MAX_CHARS,
  type PeopleFactKind,
} from "@/lib/session-summary/people-memory-budget";
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

const FREE_PLAN_LIMIT_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260822120000_add_account_plans_and_free_session_limit.sql",
);

const PREMIUM_DURATION_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260830150000_scale_premium_session_duration.sql",
);

const PRIVILEGE_HARDENING_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260901120000_harden_session_privileges_and_budget.sql",
);

const USER_PREFERENCES_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260905090000_add_user_preferences.sql",
);

const PEOPLE_MEMORY_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260906120000_add_people_memory.sql",
);

// Every table the app touches through PostgREST with a user JWT, mapped to
// the migration that carries its table-level revoke. Supabase's default
// privileges grant `anon`/`authenticated` ALL on new tables, so a
// column-level grant only means something after a table-level revoke — a new
// table must revoke in its own migration and be listed here.
const PRIVATE_TABLE_REVOKES = {
  "public.therapy_sessions": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.session_messages": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.session_summaries": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.session_trial_claims": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.user_avatar_choices": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.admin_users": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.admin_user_profiles": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.admin_audit_events": PRIVILEGE_HARDENING_MIGRATION_PATH,
  "public.user_preferences": USER_PREFERENCES_MIGRATION_PATH,
  "public.people_memories": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_memory_sources": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_persons": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_facts": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_fact_sources": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_person_mentions": PEOPLE_MEMORY_MIGRATION_PATH,
  "public.people_exclusions": PEOPLE_MEMORY_MIGRATION_PATH,
} as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
const localesCovered: AssertExhaustive<Locale, (typeof LOCALES)[number]> = true;
const factKindsCovered: AssertExhaustive<PeopleFactKind, (typeof PEOPLE_FACT_KINDS)[number]> = true;

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

describe("free-plan session limit vs limit migration", () => {
  const sql = readFileSync(FREE_PLAN_LIMIT_MIGRATION_PATH, "utf8");

  it("keeps the TypeScript pre-flight limit equal to the database trigger's limit", () => {
    const limitMatch = /v_limit constant integer := (\d+);/.exec(sql);

    expect(limitMatch, "v_limit constant not found in free-plan limit migration").not.toBeNull();
    expect(Number(limitMatch?.[1])).toBe(FREE_PLAN_SESSION_LIMIT);
  });

  it("keeps the SQLSTATE the trigger raises equal to the one the error mapper recognises", () => {
    const errcodeMatch = /errcode = '([A-Z0-9]{5})',\s*message = 'free_plan_session_limit_reached'/.exec(sql);

    expect(errcodeMatch, "free_plan_session_limit_reached errcode not found in migration").not.toBeNull();
    expect(errcodeMatch?.[1]).toBe(FREE_PLAN_SESSION_LIMIT_SQLSTATE);
  });

  it("enforces the limit on every session insert, not only on the trial claim", () => {
    expect(sql).toContain("create trigger therapy_sessions_enforce_free_plan_limit");
    expect(sql).toMatch(/before insert on public\.therapy_sessions/);
  });
});

describe("per-plan session duration vs premium duration migration", () => {
  const sql = readFileSync(PREMIUM_DURATION_MIGRATION_PATH, "utf8");

  it("lets a trial-flagged session carry exactly the two budgets the code can start", () => {
    // The first session of any account is the free-trial claim, premium
    // included, so this constraint has to admit both plans' budgets — no more
    // and no less, or a start silently fails at insert time.
    const body = extractConstraintBody(sql, "therapy_sessions_trial_duration_check");

    expect(new Set(extractNumericListValues(body))).toEqual(
      new Set([FREE_TRIAL_DURATION_SECONDS, PREMIUM_SESSION_DURATION_SECONDS]),
    );
  });

  it("keeps the claim function's guard equal to the same two budgets", () => {
    const guard = /p_duration_bucket_seconds not in \(([\d\s,]+)\)/.exec(sql);

    expect(guard, "duration guard not found in claim_free_trial_session").not.toBeNull();
    expect(new Set(guard?.[1].split(",").map((value) => Number(value.trim())))).toEqual(
      new Set([FREE_TRIAL_DURATION_SECONDS, PREMIUM_SESSION_DURATION_SECONDS]),
    );
  });

  it("keeps the new claim parameter trailing and defaulted so the pre-deploy call still works", () => {
    // CI applies migrations before deploying code: during that window the old
    // four-argument call must still resolve and still mean a 15-minute trial.
    expect(sql).toMatch(new RegExp(`p_duration_bucket_seconds integer default ${FREE_TRIAL_DURATION_SECONDS}`));
  });
});

describe("privilege hardening migration", () => {
  const sql = readFileSync(PRIVILEGE_HARDENING_MIGRATION_PATH, "utf8");

  it("revokes the default table privileges from anon and authenticated on every private table", () => {
    for (const [table, migrationPath] of Object.entries(PRIVATE_TABLE_REVOKES)) {
      const migration = readFileSync(migrationPath, "utf8");
      const revoke = new RegExp(
        `revoke all privileges on table[^;]*${escapeRegExp(table)}[^;]*from anon, authenticated`,
      );

      expect(migration, `${table} is missing a table-level revoke in ${migrationPath}`).toMatch(revoke);
    }
  });

  it("re-grants updates on therapy_sessions without the perspective columns", () => {
    const grantIndex = sql.indexOf("grant update (", sql.indexOf("public.therapy_sessions to authenticated"));
    const grantStatement = sql.slice(grantIndex, sql.indexOf(";", grantIndex));

    expect(grantStatement).toContain("expires_at");
    expect(grantStatement).not.toContain("modality_id");
    expect(grantStatement).not.toContain("avatar_id");
  });

  it("guards the time budget with the free-plan budget the code uses", () => {
    expect(sql).toContain(`v_free_plan_max_seconds constant integer := ${FREE_TRIAL_DURATION_SECONDS}`);
    expect(sql).toContain("errcode = 'P0006'");
    expect(sql).toContain("if old.status <> 'created' then");
  });

  it("lets the trial claim record both budgets a trial can get", () => {
    const body = extractConstraintBody(sql, "session_trial_claims_trial_duration_seconds_check");

    expect(new Set(extractNumericListValues(body))).toEqual(
      new Set([FREE_TRIAL_DURATION_SECONDS, PREMIUM_SESSION_DURATION_SECONDS]),
    );
  });
});

describe("user preferences migration", () => {
  const sql = readFileSync(USER_PREFERENCES_MIGRATION_PATH, "utf8");

  it("keeps the locale check constraint equal to the locales the code knows", () => {
    const body = extractConstraintBody(sql, "user_preferences_locale_check");

    expect(new Set(extractQuotedValues(body))).toEqual(new Set(LOCALES));
    expect(localesCovered).toBe(true);
  });

  it("grants only the payload columns and lets the PostgREST upsert update them", () => {
    // An upsert puts every payload column into `on conflict do update set`,
    // so `user_id` must be updatable; the trigger pins it to the old value.
    expect(sql).toContain("grant insert (user_id, locale) on table public.user_preferences to authenticated");
    expect(sql).toContain("grant update (user_id, locale) on table public.user_preferences to authenticated");
    expect(sql).not.toMatch(/grant (insert|update) \([^)]*(created_at|updated_at)/);
    expect(sql).toContain("new.user_id = old.user_id");
  });

  it("is owner-bound and disappears with the account", () => {
    expect(sql).toContain("references auth.users(id) on delete cascade");
    expect(sql).toContain("alter table public.user_preferences enable row level security");
    expect(sql).not.toContain("for delete");
  });
});

describe("people memory migration", () => {
  const sql = readFileSync(PEOPLE_MEMORY_MIGRATION_PATH, "utf8");

  it("keeps the fact kinds equal to the ones the code knows", () => {
    const body = extractConstraintBody(sql, "people_facts_kind_check");

    expect(new Set(extractQuotedValues(body))).toEqual(new Set(PEOPLE_FACT_KINDS));
    expect(factKindsCovered).toBe(true);
    // The save function repeats the list inline; a new kind must reach both.
    expect(sql.match(/in \('who', 'account', 'feeling', 'wish'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("keeps the per-avatar, per-person and batch caps equal to the application constants", () => {
    expect(sql).toContain(`v_max_persons constant integer := ${PEOPLE_MAX_PERSONS};`);
    expect(sql).toContain(`v_max_facts constant integer := ${PEOPLE_MAX_FACTS_PER_PERSON};`);
    expect(sql).toContain(`v_batch_min_chars constant integer := ${PEOPLE_BATCH_MIN_CHARS};`);
    expect(sql).toContain(`v_batch_max_chars constant integer := ${PEOPLE_BATCH_MAX_CHARS};`);
    expect(sql).toContain(`v_max_messages constant integer := ${PEOPLE_BATCH_MAX_MESSAGES};`);
    expect(sql).toContain(`v_brief_max_chars constant integer := ${PEOPLE_BRIEF_MAX_CHARS};`);
    expect(sql).toContain(`v_brief_max_persons constant integer := ${PEOPLE_BRIEF_MAX_PERSONS};`);
    expect(sql).toContain(`v_brief_max_facts constant integer := ${PEOPLE_BRIEF_MAX_FACTS};`);
    expect(sql).toContain(`length(people_brief_text) <= ${PEOPLE_BRIEF_MAX_CHARS}`);
  });

  it("keeps the column length checks equal to the application limits", () => {
    expect(sql).toContain(`length(display_name) <= ${PEOPLE_NAME_MAX_CHARS}`);
    expect(sql).toContain(`length(relation) <= ${PEOPLE_RELATION_MAX_CHARS}`);
    expect(sql).toContain(`length(text) <= ${PEOPLE_FACT_MAX_CHARS}`);
    expect(sql).toContain(`length(user_note) <= ${PEOPLE_NOTE_MAX_CHARS}`);
  });

  it("lets two people share a name and keeps the preference column additive with separate grants", () => {
    // Identity is the UUID: "Marta from work" and "Marta, the cousin" are two rows.
    expect(sql).not.toMatch(/unique[^;]*display_name/);
    expect(sql).toContain("people_memory_enabled boolean not null default true");
    expect(sql).toContain("alter table public.user_preferences alter column locale drop not null");
    expect(sql).toContain("grant insert (people_memory_enabled) on table public.user_preferences to authenticated");
    expect(sql).toContain("grant update (people_memory_enabled) on table public.user_preferences to authenticated");
    expect(sql).toContain("grant insert (about_person_id) on public.therapy_sessions to authenticated");
  });

  it("keeps the replaced pin trigger's memory completeness check and adds the brief beside it", () => {
    const trigger = sql.slice(sql.indexOf("create or replace function public.attach_avatar_session_context()"));

    expect(trigger).toContain("raise exception 'avatar_memory_not_ready' using errcode = 'P0011'");
    expect(trigger).toContain("private.render_people_brief(new.avatar_id, new.about_person_id)");
    expect(trigger).toContain("raise exception 'invalid_about_person' using errcode = 'P0012'");
  });

  it("keeps the legacy memory batch signature and only adds the forgotten-people field", () => {
    expect(sql).toContain("create or replace function public.get_avatar_memory_batch(p_avatar_id text)");
    expect(sql).toContain("'forgottenPeople', private.list_forgotten_people(p_avatar_id)");
    expect(sql).toContain("v_max_chars constant integer := 48000;");
  });
});
