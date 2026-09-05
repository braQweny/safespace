-- Additive billing boundary. No login/password or live Stripe configuration is
-- created here. Provision a login inheriting safespace_billing separately.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'safespace_billing') then
    create role safespace_billing nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
grant usage on schema private, public to safespace_billing;

create table private.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  customer_idempotency_key uuid not null default gen_random_uuid() unique,
  deletion_requested_at timestamptz,
  cancellation_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cancellation_confirmed_at is null or deletion_requested_at is not null)
);
create table private.billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references private.billing_accounts(user_id) on delete cascade,
  stripe_price_id text not null,
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  cancel_at_period_end boolean not null default false,
  paid_until timestamptz,
  latest_paid_invoice_id text,
  updated_at timestamptz not null default now(),
  check (paid_until is null or latest_paid_invoice_id is not null)
);
create index billing_subscriptions_user_idx on private.billing_subscriptions(user_id);
create unique index billing_one_open_subscription on private.billing_subscriptions(user_id)
  where status not in ('canceled', 'incomplete_expired');
create table private.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references private.billing_accounts(user_id) on delete cascade,
  stripe_checkout_session_id text unique,
  stripe_idempotency_key uuid not null default gen_random_uuid() unique,
  stripe_price_id text not null,
  success_url text not null,
  cancel_url text not null,
  locale text not null check (locale in ('en', 'pl')),
  state text not null default 'creating' check (state in ('creating', 'open', 'completed', 'expired')),
  checkout_url text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index billing_checkout_attempts_user_idx on private.billing_checkout_attempts(user_id);
create unique index billing_one_pending_checkout on private.billing_checkout_attempts(user_id)
  where state in ('creating', 'open');
create table private.billing_events (
  stripe_event_id text primary key,
  user_id uuid references private.billing_accounts(user_id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now()
);
create index billing_events_user_idx on private.billing_events(user_id);

alter table private.billing_accounts enable row level security;
alter table private.billing_subscriptions enable row level security;
alter table private.billing_checkout_attempts enable row level security;
alter table private.billing_events enable row level security;
revoke all on private.billing_accounts, private.billing_subscriptions, private.billing_checkout_attempts, private.billing_events
  from public, anon, authenticated, service_role;
grant select, insert, update on private.billing_accounts, private.billing_subscriptions, private.billing_checkout_attempts to safespace_billing;
grant select, insert on private.billing_events to safespace_billing;
create policy billing_accounts_read on private.billing_accounts for select to safespace_billing using (true);
create policy billing_accounts_insert on private.billing_accounts for insert to safespace_billing with check (true);
create policy billing_accounts_update on private.billing_accounts for update to safespace_billing using (true) with check (true);
create policy billing_subscriptions_read on private.billing_subscriptions for select to safespace_billing using (true);
create policy billing_subscriptions_insert on private.billing_subscriptions for insert to safespace_billing with check (true);
create policy billing_subscriptions_update on private.billing_subscriptions for update to safespace_billing using (true) with check (true);
create policy billing_checkout_read on private.billing_checkout_attempts for select to safespace_billing using (true);
create policy billing_checkout_insert on private.billing_checkout_attempts for insert to safespace_billing with check (true);
create policy billing_checkout_update on private.billing_checkout_attempts for update to safespace_billing using (true) with check (true);
create policy billing_events_read on private.billing_events for select to safespace_billing using (true);
create policy billing_events_insert on private.billing_events for insert to safespace_billing with check (true);

-- Only this content-free projection is exposed to the owner through the Data API.
create table public.billing_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'none',
  paid_until timestamptz,
  cancel_at_period_end boolean not null default false,
  deletion_requested_at timestamptz,
  has_customer boolean not null default false,
  pending_checkout boolean not null default false
);
alter table public.billing_entitlements enable row level security;
revoke all on public.billing_entitlements from public, anon, authenticated, service_role;
grant select on public.billing_entitlements to authenticated;
create policy billing_entitlements_owner_read on public.billing_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

create view public.billing_status with (security_invoker = true) as
select e.*, coalesce(e.paid_until > now(), false) as paid_premium_active
from public.billing_entitlements e;
revoke all on public.billing_status from public, anon, authenticated;
grant select on public.billing_status to authenticated;

-- One SQL rule for own reads, admin reads and both session gates. Current
-- transaction time, not a delayed webhook or a browser clock, ends access.
create function private.is_effective_premium(p_manual_granted_at timestamptz, p_paid_until timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_manual_granted_at is not null or coalesce(p_paid_until > now(), false);
$$;
revoke all on function private.is_effective_premium(timestamptz, timestamptz) from public, anon;
grant execute on function private.is_effective_premium(timestamptz, timestamptz) to authenticated;

create function private.account_has_premium(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select private.is_effective_premium(p.premium_granted_at, e.paid_until)
    from public.admin_user_profiles p left join public.billing_entitlements e using (user_id)
    where p.user_id = p_user_id), false);
$$;
revoke all on function private.account_has_premium(uuid) from public, anon, authenticated;

create view public.account_access with (security_invoker = true) as
select p.user_id, p.blocked_at, p.block_reason_code, p.premium_granted_at,
  private.is_effective_premium(p.premium_granted_at, e.paid_until) as effective_premium
from public.admin_user_profiles p left join public.billing_entitlements e using (user_id);
revoke all on public.account_access from public, anon, authenticated;
grant select on public.account_access to authenticated;

create function private.refresh_billing_entitlement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := new.user_id;
begin
  insert into public.billing_entitlements(user_id, status, paid_until, cancel_at_period_end, deletion_requested_at, has_customer, pending_checkout)
  select a.user_id, coalesce(s.status, 'none'),
    (select max(p.paid_until) from private.billing_subscriptions p where p.user_id = a.user_id),
    coalesce(s.cancel_at_period_end, false), a.deletion_requested_at, a.stripe_customer_id is not null,
    exists(select 1 from private.billing_checkout_attempts c where c.user_id = a.user_id and c.state in ('creating', 'open'))
  from private.billing_accounts a
  left join lateral (select b.status, b.cancel_at_period_end
    from private.billing_subscriptions b where b.user_id = a.user_id
    order by (b.status not in ('canceled', 'incomplete_expired')) desc, b.updated_at desc, b.stripe_subscription_id
    limit 1) s on true
  where a.user_id = v_user_id
  on conflict(user_id) do update set status = excluded.status, paid_until = excluded.paid_until,
    cancel_at_period_end = excluded.cancel_at_period_end, deletion_requested_at = excluded.deletion_requested_at,
    has_customer = excluded.has_customer, pending_checkout = excluded.pending_checkout;
  return new;
end $$;
revoke all on function private.refresh_billing_entitlement() from public, anon, authenticated, safespace_billing;
create trigger billing_accounts_refresh_entitlement after insert or update on private.billing_accounts
  for each row execute function private.refresh_billing_entitlement();
create trigger billing_checkout_refresh_entitlement after insert or update on private.billing_checkout_attempts
  for each row execute function private.refresh_billing_entitlement();
create trigger billing_subscriptions_refresh_entitlement after insert or update on private.billing_subscriptions
  for each row execute function private.refresh_billing_entitlement();

-- Shared ordering: advisory lock (seed 712), then billing_accounts row lock.
-- The insert trigger closes the no-billing-row race with delete_own_account.
create function private.guard_billing_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 712));
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
      or new.customer_idempotency_key is distinct from old.customer_idempotency_key
      or (old.stripe_customer_id is not null and new.stripe_customer_id is distinct from old.stripe_customer_id)
      or (old.deletion_requested_at is not null and new.deletion_requested_at is distinct from old.deletion_requested_at)
    then raise exception 'billing_identity_immutable' using errcode = 'P0010'; end if;
  end if;
  if new.cancellation_confirmed_at is not null and (
    exists (select 1 from private.billing_checkout_attempts where user_id = new.user_id and state in ('creating', 'open'))
    or exists (select 1 from private.billing_subscriptions where user_id = new.user_id and status not in ('canceled', 'incomplete_expired'))
  ) then raise exception 'billing_cancellation_pending' using errcode = 'P0010'; end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.guard_billing_account() from public, anon, authenticated, safespace_billing;
create trigger billing_accounts_guard before insert or update on private.billing_accounts
  for each row execute function private.guard_billing_account();

create function private.billing_account_can_purchase(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_user_profiles p
    left join private.billing_accounts a using(user_id)
    where p.user_id = p_user_id and p.blocked_at is null and a.deletion_requested_at is null);
$$;
revoke all on function private.billing_account_can_purchase(uuid) from public, anon, authenticated;
grant execute on function private.billing_account_can_purchase(uuid) to safespace_billing;

create function private.guard_billing_checkout()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 712));
  perform 1 from private.billing_accounts where user_id = new.user_id for update;
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id or new.id is distinct from old.id
    or new.stripe_idempotency_key is distinct from old.stripe_idempotency_key
    or new.stripe_price_id is distinct from old.stripe_price_id
    or new.success_url is distinct from old.success_url or new.cancel_url is distinct from old.cancel_url
    or new.locale is distinct from old.locale or new.expires_at is distinct from old.expires_at
    or new.created_at is distinct from old.created_at
    or (old.stripe_checkout_session_id is not null and new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id)
  ) then raise exception 'billing_checkout_identity_immutable' using errcode = 'P0010'; end if;
  -- Reconciliation may resolve an existing intent after deletion was requested.
  -- It cannot start a new intent or reopen a terminal checkout.
  if (tg_op = 'INSERT' or old.state not in ('creating', 'open')) and new.state in ('creating', 'open') then
    if not private.billing_account_can_purchase(new.user_id) then
      raise exception 'billing_purchase_unavailable' using errcode = 'P0010';
    end if;
    if exists(select 1 from private.billing_subscriptions where user_id = new.user_id and status not in ('canceled', 'incomplete_expired')) then
      raise exception 'billing_subscription_exists' using errcode = 'P0010';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_billing_checkout() from public, anon, authenticated, safespace_billing;
create trigger billing_checkout_guard before insert or update on private.billing_checkout_attempts
  for each row execute function private.guard_billing_checkout();

create function private.guard_billing_subscription()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_confirmed_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 712));
  select cancellation_confirmed_at into v_confirmed_at from private.billing_accounts
    where user_id = new.user_id for update;
  if tg_op = 'UPDATE' and (
    new.user_id is distinct from old.user_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_price_id is distinct from old.stripe_price_id
  ) then raise exception 'billing_subscription_identity_immutable' using errcode = 'P0010'; end if;
  if v_confirmed_at is not null and new.status not in ('canceled', 'incomplete_expired') then
    raise exception 'billing_cancellation_already_confirmed' using errcode = 'P0010';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.guard_billing_subscription() from public, anon, authenticated, safespace_billing;
create trigger billing_subscription_guard before insert or update on private.billing_subscriptions
  for each row execute function private.guard_billing_subscription();

create or replace function private.delete_own_account(p_confirmation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_account private.billing_accounts%rowtype;
begin
  if v_user_id is null then raise exception 'missing_auth' using errcode = '42501'; end if;
  if p_confirmation is distinct from 'USUWAM' then
    raise exception 'account_deletion_confirmation_required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 712));
  select * into v_account from private.billing_accounts where user_id = v_user_id for update;
  if found and (v_account.deletion_requested_at is null or v_account.cancellation_confirmed_at is null
    or exists(select 1 from private.billing_checkout_attempts where user_id = v_user_id and state in ('creating', 'open'))
    or exists(select 1 from private.billing_subscriptions where user_id = v_user_id and status not in ('canceled', 'incomplete_expired'))
  ) then raise exception 'billing_cancellation_required' using errcode = 'P0010'; end if;
  delete from auth.users where id = v_user_id;
  return found;
end $$;

-- Preserve legacy RPCs for the expand/deploy window; v2 adds the computed plan.
create or replace function public.enforce_free_plan_session_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit constant integer := 3;
  v_used_sessions integer;
begin
  -- Premium accounts are not capped.
  if private.account_has_premium(new.user_id) then
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

create or replace function public.enforce_therapy_session_budget()
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
    and not private.account_has_premium(new.user_id)
  then
    raise exception
      using
        errcode = 'P0006',
        message = 'free_plan_session_budget_exceeded';
  end if;

  return new;
end;
$$;

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
      where private.account_has_premium(user_id)
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

create or replace function public.list_private_admin_users(
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
        or (normalized_plan_filter = 'free' and not private.account_has_premium(profiles.user_id))
        or (normalized_plan_filter = 'premium' and private.account_has_premium(profiles.user_id))
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

create or replace function public.list_private_admin_users_v2(
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
  total_count bigint,
  effective_premium boolean
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
        or (normalized_plan_filter = 'free' and not private.account_has_premium(profiles.user_id))
        or (normalized_plan_filter = 'premium' and private.account_has_premium(profiles.user_id))
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
    count(*) over() as total_count,
    private.account_has_premium(filtered_profiles.user_id) as effective_premium
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

create or replace function public.set_private_admin_user_block_state(
  input_target_user_id uuid,
  input_action text,
  input_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_profile public.admin_user_profiles%rowtype;
  created_audit_event public.admin_audit_events%rowtype;
begin
  if auth.uid() is null or not public.is_private_admin() then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;

  if input_action is null or input_action not in ('block', 'unblock') then
    raise exception using errcode = '22023', message = 'invalid_admin_block_action';
  end if;

  if input_reason_code is null or input_reason_code not in (
    'policy_violation',
    'safety_risk',
    'abuse_prevention',
    'owner_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_admin_block_reason';
  end if;

  update public.admin_user_profiles
  set
    blocked_at = case when input_action = 'block' then now() else null end,
    blocked_by = case when input_action = 'block' then (select auth.uid()) else null end,
    block_reason_code = case when input_action = 'block' then input_reason_code else null end
  where user_id = input_target_user_id
  returning * into changed_profile;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;

  insert into public.admin_audit_events (
    admin_user_id,
    target_user_id,
    action,
    reason_code
  ) values (
    (select auth.uid()),
    input_target_user_id,
    case when input_action = 'block' then 'account_blocked' else 'account_unblocked' end,
    input_reason_code
  )
  returning * into created_audit_event;

  return jsonb_build_object(
    'profile', to_jsonb(changed_profile) || jsonb_build_object('effective_premium', private.account_has_premium(changed_profile.user_id)),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;

create or replace function public.set_private_admin_user_plan_state(
  input_target_user_id uuid,
  input_action text,
  input_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_profile public.admin_user_profiles%rowtype;
  created_audit_event public.admin_audit_events%rowtype;
begin
  if auth.uid() is null or not public.is_private_admin() then
    raise exception using errcode = '42501', message = 'active_admin_required';
  end if;

  if input_action is null or input_action not in ('grant', 'revoke') then
    raise exception using errcode = '22023', message = 'invalid_admin_plan_action';
  end if;

  if input_reason_code is null or input_reason_code not in (
    'subscription_paid',
    'subscription_ended',
    'owner_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'invalid_admin_plan_reason';
  end if;

  update public.admin_user_profiles
  set
    premium_granted_at = case when input_action = 'grant' then now() else null end,
    premium_granted_by = case when input_action = 'grant' then (select auth.uid()) else null end
  where user_id = input_target_user_id
  returning * into changed_profile;

  if not found then
    raise exception using errcode = 'P0002', message = 'admin_target_not_found';
  end if;

  insert into public.admin_audit_events (
    admin_user_id,
    target_user_id,
    action,
    reason_code
  ) values (
    (select auth.uid()),
    input_target_user_id,
    case when input_action = 'grant' then 'premium_granted' else 'premium_revoked' end,
    input_reason_code
  )
  returning * into created_audit_event;

  return jsonb_build_object(
    'profile', to_jsonb(changed_profile) || jsonb_build_object('effective_premium', private.account_has_premium(changed_profile.user_id)),
    'auditEvent', to_jsonb(created_audit_event)
  );
end;
$$;
revoke all on function public.list_private_admin_users_v2(text, text, text, integer, integer, text) from public, anon;
grant execute on function public.list_private_admin_users_v2(text, text, text, integer, integer, text) to authenticated;
