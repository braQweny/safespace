-- Account plans and the free-plan session limit.
--
-- Until now every account could start an unlimited number of sessions: the
-- only quota was the single free-trial claim, and follow-up sessions were not
-- counted at all. This migration introduces a per-account plan marker
-- (`free` vs `premium`) and a hard, database-enforced cap on how many sessions
-- a free account may own.
--
-- Design:
--   * The plan lives on `admin_user_profiles` (the safe, content-free account
--     row every auth user already has). `premium_granted_at is not null` means
--     premium. There is no payment integration yet — premium is granted by an
--     active admin (audited) or by owner-run SQL.
--   * The cap is enforced by a BEFORE INSERT trigger on `therapy_sessions`, so
--     it covers both the free-trial claim function and direct owner inserts
--     (a client cannot bypass it by talking to PostgREST directly). The count
--     includes every session row the user owns, deleted tombstones included,
--     so deleting a session never frees a slot.
--   * A per-user advisory lock serialises concurrent starts; without it two
--     requests could both observe "2 of 3" and both insert.
--   * The limit raises SQLSTATE `P0005` / `free_plan_session_limit_reached`,
--     mapped by `session-data/errors.ts` to the stable `session_limit_reached`
--     domain code. The TypeScript constant `FREE_PLAN_SESSION_LIMIT` and the
--     SQLSTATE are pinned to this file by `schema-drift.test.ts`.

-- ---------------------------------------------------------------------------
-- 1. Plan marker on the safe account profile
-- ---------------------------------------------------------------------------

alter table public.admin_user_profiles
  add column premium_granted_at timestamptz null,
  add column premium_granted_by uuid null references auth.users(id) on delete set null,
  add constraint admin_user_profiles_premium_state_check check (
    premium_granted_by is null
    or premium_granted_at is not null
  );

create index admin_user_profiles_premium_idx
  on public.admin_user_profiles (premium_granted_at)
  where premium_granted_at is not null;

-- Admins may flip the plan through the existing RLS update policy; the
-- column-level grant is what actually lets the new columns be written.
grant update (
  premium_granted_at,
  premium_granted_by
) on table public.admin_user_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit vocabulary for plan changes
-- ---------------------------------------------------------------------------

alter table public.admin_audit_events
  drop constraint admin_audit_events_action_check;

alter table public.admin_audit_events
  add constraint admin_audit_events_action_check check (
    action in (
      'account_blocked',
      'account_unblocked',
      'premium_granted',
      'premium_revoked'
    )
  );

alter table public.admin_audit_events
  drop constraint admin_audit_events_reason_code_check;

alter table public.admin_audit_events
  add constraint admin_audit_events_reason_code_check check (
    reason_code in (
      'policy_violation',
      'safety_risk',
      'abuse_prevention',
      'owner_request',
      'other',
      'subscription_paid',
      'subscription_ended'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Free-plan session limit (database gate)
-- ---------------------------------------------------------------------------

create function public.enforce_free_plan_session_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit constant integer := 3;
  v_used_sessions integer;
begin
  -- Premium accounts are not capped.
  if exists (
    select 1
    from public.admin_user_profiles as profile
    where profile.user_id = new.user_id
      and profile.premium_granted_at is not null
  ) then
    return new;
  end if;

  -- Serialise concurrent starts of the same user for the rest of this
  -- transaction, so the count below cannot race another insert.
  perform pg_advisory_xact_lock(
    hashtext('therapy_sessions_free_plan_limit'),
    hashtext(new.user_id::text)
  );

  -- Every owned row counts: any lifecycle status, deleted tombstones included.
  select count(*)
  into v_used_sessions
  from public.therapy_sessions as sessions
  where sessions.user_id = new.user_id;

  if v_used_sessions >= v_limit then
    raise exception
      using
        errcode = 'P0005',
        message = 'free_plan_session_limit_reached';
  end if;

  return new;
end;
$$;

create trigger therapy_sessions_enforce_free_plan_limit
  before insert on public.therapy_sessions
  for each row
  execute function public.enforce_free_plan_session_limit();

-- ---------------------------------------------------------------------------
-- 4. Admin aggregates and user list learn about plans
-- ---------------------------------------------------------------------------

create or replace function public.get_private_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_private_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'not_private_admin';
  end if;

  return jsonb_build_object(
    'totalUsers', (
      select count(*)
      from public.admin_user_profiles
    ),
    'blockedUsers', (
      select count(*)
      from public.admin_user_profiles
      where blocked_at is not null
    ),
    'premiumUsers', (
      select count(*)
      from public.admin_user_profiles
      where premium_granted_at is not null
    ),
    'sessionsByLifecycle', (
      select coalesce(jsonb_object_agg(status_counts.status, status_counts.total), '{}'::jsonb)
      from (
        select therapy_sessions.status, count(*) as total
        from public.therapy_sessions
        group by therapy_sessions.status
      ) as status_counts
    ),
    'activeSessions', (
      select count(*)
      from public.therapy_sessions
      where status = 'active'
    ),
    'completedSessions', (
      select count(*)
      from public.therapy_sessions
      where status = 'completed'
    ),
    'trialSessions', (
      select count(*)
      from public.therapy_sessions
      where is_trial = true
    ),
    'followUpSessions', (
      select count(*)
      from public.therapy_sessions
      where is_trial = false
        and status <> 'deleted'
    ),
    'approvedSummaries', (
      select count(*)
      from public.session_summaries
      where status = 'ready'
        and is_visible = true
    )
  );
end;
$$;

-- The list function gains a plan filter and returns the premium marker. The
-- parameter list changes, so the old overload is dropped first; callers that
-- still pass five named arguments resolve to the new function through the
-- default of `input_plan_filter`, which keeps the deploy window safe.
drop function public.list_private_admin_users(text, text, text, integer, integer);

create function public.list_private_admin_users(
  input_email_search text default null,
  input_status_filter text default 'all',
  input_sort text default 'created_desc',
  input_page integer default 1,
  input_page_size integer default 20,
  input_plan_filter text default 'all'
)
returns table (
  user_id uuid,
  email text,
  account_created_at timestamptz,
  last_sign_in_at timestamptz,
  last_activity_at timestamptz,
  blocked_at timestamptz,
  blocked_by uuid,
  block_reason_code text,
  premium_granted_at timestamptz,
  premium_granted_by uuid,
  total_sessions bigint,
  active_sessions bigint,
  completed_sessions bigint,
  approved_summaries bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_email_search text := nullif(btrim(input_email_search), '');
  normalized_status_filter text := coalesce(nullif(btrim(input_status_filter), ''), 'all');
  normalized_plan_filter text := coalesce(nullif(btrim(input_plan_filter), ''), 'all');
  normalized_sort text := coalesce(nullif(btrim(input_sort), ''), 'created_desc');
  normalized_page integer := greatest(coalesce(input_page, 1), 1);
  normalized_page_size integer := least(greatest(coalesce(input_page_size, 20), 1), 50);
begin
  if not public.is_private_admin() then
    raise exception
      using
        errcode = '42501',
        message = 'not_private_admin';
  end if;

  if normalized_status_filter not in ('all', 'active', 'blocked') then
    raise exception
      using
        errcode = '22023',
        message = 'invalid_status_filter';
  end if;

  if normalized_plan_filter not in ('all', 'free', 'premium') then
    raise exception
      using
        errcode = '22023',
        message = 'invalid_plan_filter';
  end if;

  if normalized_sort not in ('created_desc', 'created_asc', 'last_activity_desc', 'last_activity_asc') then
    raise exception
      using
        errcode = '22023',
        message = 'invalid_sort';
  end if;

  return query
  with session_counts as (
    select
      therapy_sessions.user_id,
      count(*) filter (where therapy_sessions.status <> 'deleted') as total_sessions,
      count(*) filter (where therapy_sessions.status = 'active') as active_sessions,
      count(*) filter (where therapy_sessions.status = 'completed') as completed_sessions
    from public.therapy_sessions
    group by therapy_sessions.user_id
  ),
  summary_counts as (
    select
      session_summaries.user_id,
      count(*) as approved_summaries
    from public.session_summaries
    where session_summaries.status = 'ready'
      and session_summaries.is_visible = true
    group by session_summaries.user_id
  ),
  filtered_profiles as (
    select
      profiles.user_id,
      profiles.email,
      profiles.account_created_at,
      profiles.last_sign_in_at,
      coalesce(profiles.last_activity_at, profiles.last_sign_in_at) as last_activity_at,
      profiles.blocked_at,
      profiles.blocked_by,
      profiles.block_reason_code,
      profiles.premium_granted_at,
      profiles.premium_granted_by,
      coalesce(session_counts.total_sessions, 0) as total_sessions,
      coalesce(session_counts.active_sessions, 0) as active_sessions,
      coalesce(session_counts.completed_sessions, 0) as completed_sessions,
      coalesce(summary_counts.approved_summaries, 0) as approved_summaries
    from public.admin_user_profiles as profiles
    left join session_counts
      on session_counts.user_id = profiles.user_id
    left join summary_counts
      on summary_counts.user_id = profiles.user_id
    where (
      normalized_email_search is null
      or profiles.email ilike '%' || normalized_email_search || '%'
    )
      and (
        normalized_status_filter = 'all'
        or (normalized_status_filter = 'active' and profiles.blocked_at is null)
        or (normalized_status_filter = 'blocked' and profiles.blocked_at is not null)
      )
      and (
        normalized_plan_filter = 'all'
        or (normalized_plan_filter = 'free' and profiles.premium_granted_at is null)
        or (normalized_plan_filter = 'premium' and profiles.premium_granted_at is not null)
      )
  )
  select
    filtered_profiles.user_id,
    filtered_profiles.email,
    filtered_profiles.account_created_at,
    filtered_profiles.last_sign_in_at,
    filtered_profiles.last_activity_at,
    filtered_profiles.blocked_at,
    filtered_profiles.blocked_by,
    filtered_profiles.block_reason_code,
    filtered_profiles.premium_granted_at,
    filtered_profiles.premium_granted_by,
    filtered_profiles.total_sessions,
    filtered_profiles.active_sessions,
    filtered_profiles.completed_sessions,
    filtered_profiles.approved_summaries,
    count(*) over() as total_count
  from filtered_profiles
  order by
    case when normalized_sort = 'created_asc' then filtered_profiles.account_created_at end asc nulls last,
    case when normalized_sort = 'created_desc' then filtered_profiles.account_created_at end desc nulls last,
    case when normalized_sort = 'last_activity_asc' then filtered_profiles.last_activity_at end asc nulls last,
    case when normalized_sort = 'last_activity_desc' then filtered_profiles.last_activity_at end desc nulls last,
    filtered_profiles.user_id asc
  limit normalized_page_size
  offset (normalized_page - 1) * normalized_page_size;
end;
$$;

grant execute on function public.list_private_admin_users(text, text, text, integer, integer, text) to authenticated;
