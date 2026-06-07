create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  deactivated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_deactivated_check check (
    (is_active = true and deactivated_at is null)
    or (is_active = false)
  )
);

create table public.admin_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  account_created_at timestamptz not null,
  last_sign_in_at timestamptz null,
  last_activity_at timestamptz null,
  blocked_at timestamptz null,
  blocked_by uuid null references auth.users(id) on delete set null,
  block_reason_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_user_profiles_email_check check (length(btrim(email)) > 0),
  constraint admin_user_profiles_block_reason_code_check check (
    block_reason_code is null
    or block_reason_code in (
      'policy_violation',
      'safety_risk',
      'abuse_prevention',
      'owner_request',
      'other'
    )
  ),
  constraint admin_user_profiles_block_state_check check (
    (
      blocked_at is null
      and blocked_by is null
      and block_reason_code is null
    )
    or (
      blocked_at is not null
      and blocked_by is not null
      and block_reason_code is not null
    )
  )
);

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  target_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  reason_code text not null,
  created_at timestamptz not null default now(),
  constraint admin_audit_events_action_check check (
    action in ('account_blocked', 'account_unblocked')
  ),
  constraint admin_audit_events_reason_code_check check (
    reason_code in (
      'policy_violation',
      'safety_risk',
      'abuse_prevention',
      'owner_request',
      'other'
    )
  )
);

create index admin_user_profiles_email_lower_idx
  on public.admin_user_profiles (lower(email));

create index admin_user_profiles_blocked_idx
  on public.admin_user_profiles (blocked_at)
  where blocked_at is not null;

create index admin_user_profiles_last_activity_idx
  on public.admin_user_profiles (last_activity_at desc nulls last);

create index admin_audit_events_target_created_idx
  on public.admin_audit_events (target_user_id, created_at desc);

create function public.set_private_admin_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row
  execute function public.set_private_admin_updated_at();

create trigger admin_user_profiles_set_updated_at
  before update on public.admin_user_profiles
  for each row
  execute function public.set_private_admin_updated_at();

create function public.sync_admin_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_user_profiles (
    user_id,
    email,
    account_created_at,
    last_sign_in_at
  )
  values (
    new.id,
    coalesce(nullif(btrim(new.email), ''), new.id::text),
    new.created_at,
    new.last_sign_in_at
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    account_created_at = excluded.account_created_at,
    last_sign_in_at = excluded.last_sign_in_at;

  return new;
end;
$$;

insert into public.admin_user_profiles (
  user_id,
  email,
  account_created_at,
  last_sign_in_at
)
select
  users.id,
  coalesce(nullif(btrim(users.email), ''), users.id::text),
  users.created_at,
  users.last_sign_in_at
from auth.users as users
on conflict (user_id) do update
set
  email = excluded.email,
  account_created_at = excluded.account_created_at,
  last_sign_in_at = excluded.last_sign_in_at;

create trigger admin_user_profiles_sync_auth_user
  after insert or update of email, created_at, last_sign_in_at on auth.users
  for each row
  execute function public.sync_admin_user_profile_from_auth();

create function public.is_private_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users as admin
    left join public.admin_user_profiles as profile
      on profile.user_id = admin.user_id
    where admin.user_id = (select auth.uid())
      and admin.is_active = true
      and profile.blocked_at is null
  );
$$;

alter table public.admin_users enable row level security;
alter table public.admin_user_profiles enable row level security;
alter table public.admin_audit_events enable row level security;

create policy "Active admins can read admin memberships"
  on public.admin_users
  for select
  to authenticated
  using (public.is_private_admin());

create policy "Active admins can read safe user profiles"
  on public.admin_user_profiles
  for select
  to authenticated
  using (public.is_private_admin());

create policy "Users can read their own safe account status"
  on public.admin_user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Active admins can update account block state"
  on public.admin_user_profiles
  for update
  to authenticated
  using (public.is_private_admin())
  with check (public.is_private_admin());

create policy "Active admins can read admin audit events"
  on public.admin_audit_events
  for select
  to authenticated
  using (public.is_private_admin());

create policy "Active admins can insert admin audit events"
  on public.admin_audit_events
  for insert
  to authenticated
  with check (
    public.is_private_admin()
    and admin_user_id = (select auth.uid())
  );

grant execute on function public.is_private_admin() to authenticated;

grant select on table public.admin_users to authenticated;

grant select on table public.admin_user_profiles to authenticated;
grant update (
  blocked_at,
  blocked_by,
  block_reason_code
) on table public.admin_user_profiles to authenticated;

grant select on table public.admin_audit_events to authenticated;
grant insert (
  admin_user_id,
  target_user_id,
  action,
  reason_code
) on table public.admin_audit_events to authenticated;
