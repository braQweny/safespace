import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DIFFICULTY_LABEL_TAKEN_SQLSTATE, FREE_PLAN_SESSION_LIMIT_SQLSTATE } from "../errors";
import { FREE_PLAN_SESSION_LIMIT } from "../quota";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { SESSION_LENS_IDS } from "@/lib/session-ai/session-lenses";
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
  PEOPLE_TIMELINE_KINDS,
  type PeopleFactKind,
} from "@/lib/session-summary/people-memory-budget";
import {
  DIFFICULTY_ALIAS_MAX_CHARS,
  DIFFICULTY_EFFECTS,
  DIFFICULTY_EFFECT_KINDS,
  DIFFICULTY_ENTRY_KINDS,
  DIFFICULTY_ENTRY_MAX_CHARS,
  DIFFICULTY_LABEL_MAX_CHARS,
  DIFFICULTY_MAX_ALIASES,
  DIFFICULTY_MAX_ENTRIES,
  DIFFICULTY_MAX_PERSONS,
  DIFFICULTY_MAX_PER_AVATAR,
  DIFFICULTY_NOTE_MAX_CHARS,
  DIFFICULTY_PARENT_KINDS,
  DIFFICULTY_PERSON_STATES,
  DIFFICULTY_UPDATE_WINDOW,
  type DifficultyEffect,
  type DifficultyEntryKind,
  type DifficultyPersonState,
} from "@/lib/session-summary/topic-map-budget";
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
const PEOPLE_TIMELINE_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260906150000_add_people_fact_timeline_kinds.sql",
);
const SESSION_LENS_MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260906160000_add_session_lens.sql",
);
const TOPIC_MAP_MIGRATION_PATH = resolve(__dirname, "../../../../supabase/migrations/20260906190000_add_topic_map.sql");

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
  "public.difficulties": TOPIC_MAP_MIGRATION_PATH,
  "public.difficulty_aliases": TOPIC_MAP_MIGRATION_PATH,
  "public.difficulty_persons": TOPIC_MAP_MIGRATION_PATH,
  "public.difficulty_entries": TOPIC_MAP_MIGRATION_PATH,
  "public.difficulty_entry_sources": TOPIC_MAP_MIGRATION_PATH,
  "public.difficulty_mentions": TOPIC_MAP_MIGRATION_PATH,
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
const entryKindsCovered: AssertExhaustive<DifficultyEntryKind, (typeof DIFFICULTY_ENTRY_KINDS)[number]> = true;
const effectsCovered: AssertExhaustive<DifficultyEffect, (typeof DIFFICULTY_EFFECTS)[number]> = true;
const personStatesCovered: AssertExhaustive<DifficultyPersonState, (typeof DIFFICULTY_PERSON_STATES)[number]> = true;

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

  it("started with the four original fact kinds, which the timeline migration extends", () => {
    const body = extractConstraintBody(sql, "people_facts_kind_check");

    expect(new Set(extractQuotedValues(body))).toEqual(new Set(["who", "account", "feeling", "wish"]));
    expect(factKindsCovered).toBe(true);
  });

  it("keeps the per-avatar, per-person and batch caps equal to the application constants", () => {
    expect(sql).toContain(`v_max_persons constant integer := ${PEOPLE_MAX_PERSONS};`);
    expect(sql).toContain(`v_max_facts constant integer := ${PEOPLE_MAX_FACTS_PER_PERSON};`);
    expect(sql).toContain(`v_batch_min_chars constant integer := ${PEOPLE_BATCH_MIN_CHARS};`);
    expect(sql).toContain(`v_batch_max_chars constant integer := ${PEOPLE_BATCH_MAX_CHARS};`);
    expect(sql).toContain(`v_max_messages constant integer := ${PEOPLE_BATCH_MAX_MESSAGES};`);
    expect(sql).toContain(`v_brief_max_chars constant integer := ${PEOPLE_BRIEF_MAX_CHARS};`);
    expect(sql).toContain(`v_brief_max_persons constant integer := ${PEOPLE_BRIEF_MAX_PERSONS};`);
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

describe("people fact timeline migration", () => {
  const sql = readFileSync(PEOPLE_TIMELINE_MIGRATION_PATH, "utf8");
  const inlineKindList = "in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome')";

  it("keeps the fact kinds equal to the ones the code knows, in the check and in every inline list of the save function", () => {
    const check = /people_facts_kind_check\s+check \(kind in \(([^)]*)\)\)/.exec(sql);

    expect(check).not.toBeNull();
    expect(new Set(extractQuotedValues(check?.[1] ?? ""))).toEqual(new Set(PEOPLE_FACT_KINDS));
    expect(new Set(PEOPLE_TIMELINE_KINDS)).toEqual(new Set(["attempt", "outcome"]));
    // The check, replaceFacts, addFacts, the new-person guard and the new-person loop.
    expect(sql.split(inlineKindList).length - 1).toBe(5);
    expect(sql).not.toMatch(/in \('who', 'account', 'feeling', 'wish'\)/);
  });

  it("ranks attempts and outcomes right after who in the brief and keeps every cap equal to the constants", () => {
    expect(sql).toContain(
      "when 'who' then 0 when 'attempt' then 1 when 'outcome' then 2 when 'wish' then 3 when 'account' then 4 else 5 end",
    );
    expect(sql).toContain(`v_brief_max_chars constant integer := ${PEOPLE_BRIEF_MAX_CHARS};`);
    expect(sql).toContain(`v_brief_max_persons constant integer := ${PEOPLE_BRIEF_MAX_PERSONS};`);
    expect(sql).toContain(`v_brief_max_facts constant integer := ${PEOPLE_BRIEF_MAX_FACTS};`);
    expect(sql).toContain(`v_max_persons constant integer := ${PEOPLE_MAX_PERSONS};`);
    expect(sql).toContain(`v_max_facts constant integer := ${PEOPLE_MAX_FACTS_PER_PERSON};`);
    for (const label of ["something the user agreed to try: ", "what the user later said came of it: "]) {
      expect(sql).toContain(label);
    }
  });
});

describe("session lens migration", () => {
  const sql = readFileSync(SESSION_LENS_MIGRATION_PATH, "utf8");

  it("keeps the allowed lenses equal to the catalog and lets only the owner update the column", () => {
    const body = extractConstraintBody(sql, "therapy_sessions_session_lens_check");

    expect(new Set(extractQuotedValues(body))).toEqual(new Set(SESSION_LENS_IDS));
    expect(sql).toContain("grant update (session_lens) on table public.therapy_sessions to authenticated");
    // The label is prompt material about the conversation's subject: never an admin field.
    expect(sql).not.toMatch(/admin/i);
  });
});

describe("topic map migration", () => {
  const sql = readFileSync(TOPIC_MAP_MIGRATION_PATH, "utf8");
  const inlineKindList = "in ('how', 'coping', 'update', 'suggested', 'agreed', 'outcome')";

  it("keeps entry kinds, effects and edge states equal to the ones the code knows", () => {
    expect(new Set(extractQuotedValues(extractConstraintBody(sql, "difficulty_entries_kind_check")))).toEqual(
      new Set(DIFFICULTY_ENTRY_KINDS),
    );
    // The effect check names the two kinds that may carry an effect plus every
    // effect value; it is the last constraint of its table, so read its line.
    const effectLine = sql
      .split("\n")
      .find((line) => line.includes("constraint difficulty_entries_effect_check check"));
    expect(effectLine).toBeDefined();
    expect(new Set(extractQuotedValues(effectLine ?? ""))).toEqual(
      new Set([...DIFFICULTY_EFFECT_KINDS, ...DIFFICULTY_EFFECTS]),
    );
    expect(new Set(extractQuotedValues(extractConstraintBody(sql, "difficulty_persons_state_check")))).toEqual(
      new Set(DIFFICULTY_PERSON_STATES),
    );
    // The check, apply_difficulty_changes and the new-difficulty guard in the save function.
    expect(sql.split(inlineKindList).length - 1).toBe(3);
    expect(entryKindsCovered).toBe(true);
    expect(effectsCovered).toBe(true);
    expect(personStatesCovered).toBe(true);
  });

  it("allows exactly the parent pairs the code allows and nulls a child's parent on delete", () => {
    const trigger = sql.slice(sql.indexOf("create function public.difficulty_entries_check_parent()"));
    expect(trigger).toContain("(new.kind = 'agreed' and v_parent.kind = 'suggested')");
    expect(trigger).toContain("(new.kind = 'outcome' and v_parent.kind in ('suggested', 'agreed'))");
    expect(DIFFICULTY_PARENT_KINDS).toEqual({ agreed: ["suggested"], outcome: ["suggested", "agreed"] });
    expect(sql).toContain("before insert or update of parent_entry_id, kind on public.difficulty_entries");
    expect(sql).toContain("parent_entry_id uuid references public.difficulty_entries(id) on delete set null");
  });

  it("keeps the caps, the update window and the length checks equal to the application constants", () => {
    expect(sql).toContain(`v_max_difficulties constant integer := ${DIFFICULTY_MAX_PER_AVATAR};`);
    expect(sql).toContain(`v_max_entries constant integer := ${DIFFICULTY_MAX_ENTRIES};`);
    expect(sql).toContain(`v_max_difficulty_persons constant integer := ${DIFFICULTY_MAX_PERSONS};`);
    expect(sql).toContain(`v_max_aliases constant integer := ${DIFFICULTY_MAX_ALIASES};`);
    expect(sql).toContain(`v_update_window constant integer := ${DIFFICULTY_UPDATE_WINDOW};`);
    expect(sql).toContain(`length(label) <= ${DIFFICULTY_LABEL_MAX_CHARS}`);
    expect(sql).toContain(`length(alias) <= ${DIFFICULTY_ALIAS_MAX_CHARS}`);
    expect(sql).toContain(`length(text) <= ${DIFFICULTY_ENTRY_MAX_CHARS}`);
    expect(sql).toContain(`length(user_note) <= ${DIFFICULTY_NOTE_MAX_CHARS}`);
  });

  it("deduplicates by normalized label and alias per perspective and reports a taken label with its SQLSTATE", () => {
    expect(sql).toContain(
      "create unique index difficulties_label_unique_idx on public.difficulties(user_id, avatar_id, label_normalized)",
    );
    expect(sql).toContain(
      "create unique index difficulty_aliases_unique_idx on public.difficulty_aliases(user_id, avatar_id, alias_normalized)",
    );
    expect(sql).toContain(
      `raise exception 'difficulty_label_taken' using errcode = '${DIFFICULTY_LABEL_TAKEN_SQLSTATE}'`,
    );
    // Normalizacja w triggerze, nie w kolumnie generowanej.
    expect(sql).toContain("new.label_normalized := private.normalize_person_name(new.label)");
    expect(sql).not.toMatch(/generated always as/i);
  });

  it("keeps the shared batch signatures, the preference additive, and the merge outside the caps", () => {
    expect(sql).toContain(
      "create or replace function public.get_people_memory_batch(p_avatar_id text, p_max_chars integer default 16000)",
    );
    expect(sql).toContain(
      "create or replace function public.save_people_memory_batch(\n  p_avatar_id text, p_revision uuid, p_cursors jsonb, p_changes jsonb\n)",
    );
    expect(sql).toContain("topic_map_enabled boolean not null default true");
    expect(sql).toContain("grant insert (topic_map_enabled) on table public.user_preferences to authenticated");
    expect(sql).toContain("grant update (topic_map_enabled) on table public.user_preferences to authenticated");
    expect(sql).toContain("grant insert (about_difficulty_id) on public.therapy_sessions to authenticated");
    expect(sql).toContain("raise exception 'invalid_about_difficulty' using errcode = 'P0013'");
    const merge = sql.slice(
      sql.indexOf("create function public.merge_difficulties("),
      sql.indexOf("-- 8. Przełącznik mapy"),
    );
    for (const cap of ["v_max_entries", "v_max_difficulty_persons", "v_max_aliases"]) expect(merge).not.toContain(cap);
    expect(sql).toContain("public.merge_difficulties(uuid, uuid)");
    // The label is the user's own words about their own life: never an admin field
    // (the auth admin role only appears in the account-cascade guard).
    expect(sql.replace(/supabase_auth_admin/g, "")).not.toMatch(/admin/i);
  });
});
