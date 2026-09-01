-- Harden table privileges, freeze a running session's time budget, purge
-- content on every tombstone, and tidy indexes.
--
-- Why privileges first: Supabase's default privileges grant `anon`,
-- `authenticated` and `service_role` ALL on every new table in `public`. The
-- boundary migrations then added *column-level* grants on top, which only
-- widen — they never narrowed the pre-existing table-level grant. So until now
-- an authenticated user could, through PostgREST with their own JWT, update
-- any column of their own `therapy_sessions` row (including `expires_at`), and
-- `anon` held table privileges that only RLS kept harmless. The pattern that
-- `20260604202000` already used for `user_avatar_choices` — revoke, then
-- re-grant exactly what the app uses — is applied to every private table here.
-- `service_role` is left untouched (Supabase tooling relies on it).
--
-- Why a budget trigger: with the update grant on `expires_at` the app needs
-- (created → active sets it), the database has to be the gate for the time
-- budget the same way it is for the free-plan cap. A row's `started_at`,
-- `expires_at` and `duration_bucket_seconds` are frozen once it leaves
-- `created`, `expires_at` may not exceed `started_at + bucket`, and a free
-- account may not carry a bucket above the free budget. Only a *change* is
-- checked, so a premium revoke mid-conversation never cuts a session under way.
--
-- Why a purge trigger: `delete_owned_session()` purges before it tombstones,
-- but the grant on `status` also allows a direct `status = 'deleted'` update
-- that would leave the transcript behind a content-free tombstone. The purge
-- now follows the tombstone itself.
--
-- Backward-compatible with the currently deployed code: every column the app
-- writes stays writable, every select it issues stays readable, and no
-- constraint is narrowed on data the app produces.

-- ---------------------------------------------------------------------------
-- 1. Privileges: revoke, then re-grant the closed set the app uses
-- ---------------------------------------------------------------------------

revoke all privileges on table
  public.therapy_sessions,
  public.session_messages,
  public.session_summaries,
  public.session_trial_claims,
  public.user_avatar_choices,
  public.admin_users,
  public.admin_user_profiles,
  public.admin_audit_events
from anon, authenticated;

grant select on table public.therapy_sessions to authenticated;
grant insert (
  user_id,
  modality_id,
  avatar_id,
  status,
  started_at,
  expires_at,
  is_trial,
  duration_bucket_seconds,
  uses_approved_context
) on table public.therapy_sessions to authenticated;
-- No `modality_id` / `avatar_id` on update: the perspective is fixed at start
-- and the tombstone trigger clears both itself.
grant update (
  status,
  started_at,
  ended_at,
  expires_at,
  deletion_reason_code,
  duration_bucket_seconds
) on table public.therapy_sessions to authenticated;

grant select on table public.session_messages to authenticated;
grant insert (
  session_id,
  user_id,
  role,
  sequence_index,
  content
) on table public.session_messages to authenticated;
grant delete on table public.session_messages to authenticated;

grant select on table public.session_summaries to authenticated;
grant insert (
  session_id,
  user_id,
  summary_text,
  status,
  is_visible,
  revision
) on table public.session_summaries to authenticated;
grant update (
  summary_text,
  status,
  is_visible,
  revision
) on table public.session_summaries to authenticated;
grant delete on table public.session_summaries to authenticated;

grant select on table public.session_trial_claims to authenticated;
grant insert (
  session_id,
  user_id
) on table public.session_trial_claims to authenticated;

grant select on table public.user_avatar_choices to authenticated;
grant insert (user_id, modality_id, avatar_id) on table public.user_avatar_choices to authenticated;
grant update (user_id, modality_id, avatar_id) on table public.user_avatar_choices to authenticated;

grant select on table public.admin_users to authenticated;

-- The own-row policy lets every user read their safe account status; the
-- acting admin's id behind a block or a plan grant is not part of that.
-- Admin surfaces read profiles through the definer RPCs, which are unaffected.
grant select (
  user_id,
  email,
  account_created_at,
  last_sign_in_at,
  last_activity_at,
  blocked_at,
  block_reason_code,
  premium_granted_at,
  created_at,
  updated_at
) on table public.admin_user_profiles to authenticated;

-- Reads stay policy-bound to active admins; writes moved into definer RPCs in
-- `20260826165029`, so no insert/update grant is restored.
grant select on table public.admin_audit_events to authenticated;

-- Admin RPCs: same closed execute set the owner-bound session functions use.
revoke execute on function public.is_private_admin() from public, anon;
revoke execute on function public.get_private_admin_overview() from public, anon;
revoke execute on function public.list_private_admin_users(text, text, text, integer, integer, text) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Time budget: frozen once active, bounded by bucket, bucket bounded by plan
-- ---------------------------------------------------------------------------

create or replace function public.set_therapy_sessions_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.id = old.id;
    new.user_id = old.user_id;
    new.created_at = old.created_at;
    new.is_trial = old.is_trial;
    new.uses_approved_context = old.uses_approved_context;

    if old.trial_claim_id is not null then
      new.trial_claim_id = old.trial_claim_id;
    end if;

    -- The budget is pinned when the session goes active; nothing after that
    -- (the owner, a plan change, a late request) may stretch or cut it.
    if old.status <> 'created' then
      new.started_at = old.started_at;
      new.expires_at = old.expires_at;
      new.duration_bucket_seconds = old.duration_bucket_seconds;
    end if;

    if old.status = 'deleted' then
      new.status = 'deleted';
      new.deleted_at = old.deleted_at;
      new.deletion_reason_code = old.deletion_reason_code;
    end if;
  end if;

  if new.is_trial and new.duration_bucket_seconds is null then
    new.duration_bucket_seconds = 900;
  end if;

  if new.status = 'deleted' then
    new.modality_id = null;
    new.avatar_id = null;

    if new.deleted_at is null then
      new.deleted_at = now();
    end if;
  else
    new.deleted_at = null;
    new.deletion_reason_code = null;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create function public.enforce_therapy_session_budget()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_free_plan_max_seconds constant integer := 900;
  v_budget_changed boolean;
begin
  v_budget_changed := tg_op = 'INSERT'
    or new.started_at is distinct from old.started_at
    or new.expires_at is distinct from old.expires_at
    or new.duration_bucket_seconds is distinct from old.duration_bucket_seconds;

  -- Only a change is judged, so a session already under way keeps the budget
  -- it started with whatever happens to the plan meanwhile.
  if not v_budget_changed then
    return new;
  end if;

  if new.started_at is not null
    and new.expires_at is not null
    and new.duration_bucket_seconds is not null
    and new.expires_at > new.started_at
      + make_interval(secs => new.duration_bucket_seconds)
      + interval '5 seconds'
  then
    raise exception
      using
        errcode = 'P0006',
        message = 'session_budget_exceeds_bucket';
  end if;

  if coalesce(new.duration_bucket_seconds, 0) > v_free_plan_max_seconds
    and not exists (
      select 1
      from public.admin_user_profiles as profile
      where profile.user_id = new.user_id
        and profile.premium_granted_at is not null
    )
  then
    raise exception
      using
        errcode = 'P0006',
        message = 'free_plan_session_budget_exceeded';
  end if;

  return new;
end;
$$;

-- Fires before `therapy_sessions_set_metadata` (alphabetical order), i.e. it
-- sees the values the statement asked for, and the freeze above still applies.
create trigger therapy_sessions_enforce_budget
  before insert or update on public.therapy_sessions
  for each row
  execute function public.enforce_therapy_session_budget();

-- ---------------------------------------------------------------------------
-- 3. Purge follows the tombstone
-- ---------------------------------------------------------------------------

create function public.purge_tombstoned_session_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_messages
  where session_id = new.id
    and user_id = new.user_id;

  delete from public.session_summaries
  where session_id = new.id
    and user_id = new.user_id;

  return null;
end;
$$;

create trigger therapy_sessions_purge_on_tombstone
  after update of status on public.therapy_sessions
  for each row
  when (new.status = 'deleted' and old.status is distinct from 'deleted')
  execute function public.purge_tombstoned_session_content();

-- ---------------------------------------------------------------------------
-- 4. Trial claim records the budget the trial actually got
-- ---------------------------------------------------------------------------

alter table public.session_trial_claims
  drop constraint session_trial_claims_trial_duration_seconds_check;

alter table public.session_trial_claims
  add constraint session_trial_claims_trial_duration_seconds_check check (
    trial_duration_seconds in (900, 3600)
  );

create or replace function public.set_session_trial_claims_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_session_duration integer;
begin
  new.created_at = now();
  new.claimed_at = now();

  select sessions.duration_bucket_seconds
  into v_session_duration
  from public.therapy_sessions as sessions
  where sessions.id = new.session_id
    and sessions.user_id = new.user_id;

  new.trial_duration_seconds = case
    when v_session_duration in (900, 3600) then v_session_duration
    else 900
  end;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Audit rows outlive a deleted target account
-- ---------------------------------------------------------------------------

-- `on delete restrict` made it impossible to delete an auth user who had ever
-- been blocked or granted premium. The acting admin stays `restrict`
-- (audit integrity); the target becomes nullable — a deleted account reads as
-- "no longer exists" instead of blocking its own erasure.
alter table public.admin_audit_events
  alter column target_user_id drop not null;

alter table public.admin_audit_events
  drop constraint admin_audit_events_target_user_id_fkey;

alter table public.admin_audit_events
  add constraint admin_audit_events_target_user_id_fkey
  foreign key (target_user_id)
  references auth.users (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 6. Indexes: drop duplicates of unique constraints, add what queries use
-- ---------------------------------------------------------------------------

-- Both duplicate a unique constraint's own index.
drop index if exists public.session_messages_session_order_idx;
drop index if exists public.session_summaries_session_revision_idx;

-- The approved-context read filters `status = 'ready' and is_visible` and
-- orders by `updated_at`; the old (user_id, is_visible, created_at) index
-- matched neither the filter nor the sort.
drop index if exists public.session_summaries_user_visible_idx;

create index session_summaries_user_ready_idx
  on public.session_summaries (user_id, updated_at desc)
  where status = 'ready' and is_visible = true;

-- Foreign keys without a supporting index: `on delete set null` on the claim
-- and the audit lookups by acting admin otherwise scan the whole table.
create index therapy_sessions_trial_claim_id_idx
  on public.therapy_sessions (trial_claim_id)
  where trial_claim_id is not null;

create index admin_audit_events_admin_created_idx
  on public.admin_audit_events (admin_user_id, created_at desc);
