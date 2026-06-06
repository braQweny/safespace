create extension if not exists pgcrypto with schema extensions;

create table public.therapy_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  modality_id text null,
  avatar_id text null,
  status text not null default 'created',
  started_at timestamptz null,
  ended_at timestamptz null,
  expires_at timestamptz null,
  deleted_at timestamptz null,
  deletion_reason_code text null,
  is_trial boolean not null default false,
  trial_claim_id uuid null,
  duration_bucket_seconds integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint therapy_sessions_id_user_id_key unique (id, user_id),
  constraint therapy_sessions_status_check check (
    status in (
      'created',
      'active',
      'completed',
      'expired',
      'interrupted',
      'deleted'
    )
  ),
  constraint therapy_sessions_modality_id_check check (
    modality_id is null
    or modality_id in (
      'psychodynamic',
      'cbt',
      'humanistic_experiential',
      'systemic',
      'integrative'
    )
  ),
  constraint therapy_sessions_avatar_id_check check (
    avatar_id is null
    or avatar_id in (
      'psychodynamic-listener',
      'cbt-guide',
      'experiential-companion',
      'systemic-connector',
      'integrative-guide'
    )
  ),
  constraint therapy_sessions_modality_avatar_pair_check check (
    (modality_id is null and avatar_id is null)
    or (modality_id = 'psychodynamic' and avatar_id = 'psychodynamic-listener')
    or (modality_id = 'cbt' and avatar_id = 'cbt-guide')
    or (
      modality_id = 'humanistic_experiential'
      and avatar_id = 'experiential-companion'
    )
    or (modality_id = 'systemic' and avatar_id = 'systemic-connector')
    or (modality_id = 'integrative' and avatar_id = 'integrative-guide')
  ),
  constraint therapy_sessions_deletion_reason_code_check check (
    deletion_reason_code is null
    or deletion_reason_code in (
      'user_request',
      'retention_expired',
      'safety_cleanup',
      'system_cleanup'
    )
  ),
  constraint therapy_sessions_duration_bucket_seconds_check check (
    duration_bucket_seconds is null
    or duration_bucket_seconds in (0, 300, 900, 1800, 3600)
  ),
  constraint therapy_sessions_trial_duration_check check (
    is_trial = false
    or duration_bucket_seconds is null
    or duration_bucket_seconds = 900
  ),
  constraint therapy_sessions_time_order_check check (
    (started_at is null or ended_at is null or ended_at >= started_at)
    and (started_at is null or expires_at is null or expires_at >= started_at)
  ),
  constraint therapy_sessions_deleted_tombstone_check check (
    (
      status = 'deleted'
      and deleted_at is not null
      and deletion_reason_code is not null
      and modality_id is null
      and avatar_id is null
    )
    or (
      status <> 'deleted'
      and deleted_at is null
      and deletion_reason_code is null
    )
  )
);

create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  sequence_index integer not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint session_messages_session_owner_fkey foreign key (session_id, user_id)
    references public.therapy_sessions (id, user_id)
    on delete cascade,
  constraint session_messages_role_check check (
    role in ('user', 'assistant', 'system_boundary')
  ),
  constraint session_messages_sequence_index_check check (sequence_index >= 0),
  constraint session_messages_content_check check (length(btrim(content)) > 0),
  constraint session_messages_session_sequence_key unique (session_id, sequence_index)
);

create table public.session_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_text text not null,
  status text not null default 'draft',
  is_visible boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_summaries_session_owner_fkey foreign key (session_id, user_id)
    references public.therapy_sessions (id, user_id)
    on delete cascade,
  constraint session_summaries_status_check check (
    status in ('draft', 'ready', 'stale', 'deleted')
  ),
  constraint session_summaries_revision_check check (revision >= 1),
  constraint session_summaries_summary_text_check check (length(btrim(summary_text)) > 0),
  constraint session_summaries_deleted_visibility_check check (
    status <> 'deleted'
    or is_visible = false
  ),
  constraint session_summaries_session_revision_key unique (session_id, revision)
);

create table public.session_trial_claims (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  trial_duration_seconds integer not null default 900,
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint session_trial_claims_session_owner_fkey foreign key (session_id, user_id)
    references public.therapy_sessions (id, user_id)
    on delete cascade,
  constraint session_trial_claims_trial_duration_seconds_check check (
    trial_duration_seconds = 900
  ),
  constraint session_trial_claims_user_key unique (user_id),
  constraint session_trial_claims_session_key unique (session_id)
);

alter table public.therapy_sessions
  add constraint therapy_sessions_trial_claim_id_fkey
  foreign key (trial_claim_id)
  references public.session_trial_claims (id)
  on delete set null;

create index therapy_sessions_user_created_idx
  on public.therapy_sessions (user_id, created_at desc);

create index therapy_sessions_user_status_idx
  on public.therapy_sessions (user_id, status);

create index session_messages_session_order_idx
  on public.session_messages (session_id, sequence_index);

create index session_messages_user_session_idx
  on public.session_messages (user_id, session_id);

create index session_summaries_user_visible_idx
  on public.session_summaries (user_id, is_visible, created_at desc);

create index session_summaries_session_revision_idx
  on public.session_summaries (session_id, revision desc);

create function public.set_therapy_sessions_metadata()
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

    if old.trial_claim_id is not null then
      new.trial_claim_id = old.trial_claim_id;
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

create trigger therapy_sessions_set_metadata
  before insert or update on public.therapy_sessions
  for each row
  execute function public.set_therapy_sessions_metadata();

create function public.set_session_messages_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at = now();
  return new;
end;
$$;

create trigger session_messages_set_metadata
  before insert on public.session_messages
  for each row
  execute function public.set_session_messages_metadata();

create function public.set_session_summaries_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.id = old.id;
    new.session_id = old.session_id;
    new.user_id = old.user_id;
    new.created_at = old.created_at;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger session_summaries_set_metadata
  before insert or update on public.session_summaries
  for each row
  execute function public.set_session_summaries_metadata();

create function public.set_session_trial_claims_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at = now();
  new.claimed_at = now();
  new.trial_duration_seconds = 900;
  return new;
end;
$$;

create trigger session_trial_claims_set_metadata
  before insert on public.session_trial_claims
  for each row
  execute function public.set_session_trial_claims_metadata();

create function public.attach_session_trial_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.therapy_sessions
    where id = new.session_id
      and user_id = new.user_id
      and is_trial = true
      and status <> 'deleted'
  ) then
    raise exception
      using
        errcode = '23514',
        message = 'session_trial_claim_requires_trial_session';
  end if;

  update public.therapy_sessions
  set trial_claim_id = new.id
  where id = new.session_id
    and user_id = new.user_id;

  return new;
end;
$$;

create trigger session_trial_claims_attach_to_session
  after insert on public.session_trial_claims
  for each row
  execute function public.attach_session_trial_claim();

alter table public.therapy_sessions enable row level security;
alter table public.session_messages enable row level security;
alter table public.session_summaries enable row level security;
alter table public.session_trial_claims enable row level security;

create policy "Users can read their own therapy sessions"
  on public.therapy_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own therapy sessions"
  on public.therapy_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own therapy sessions"
  on public.therapy_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read their own session messages"
  on public.session_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own session messages"
  on public.session_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own session messages"
  on public.session_messages
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own session summaries"
  on public.session_summaries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own session summaries"
  on public.session_summaries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own session summaries"
  on public.session_summaries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own session summaries"
  on public.session_summaries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own trial claim"
  on public.session_trial_claims
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own trial claim"
  on public.session_trial_claims
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select on table public.therapy_sessions to authenticated;
grant insert (
  user_id,
  modality_id,
  avatar_id,
  status,
  started_at,
  expires_at,
  is_trial,
  duration_bucket_seconds
) on table public.therapy_sessions to authenticated;
grant update (
  modality_id,
  avatar_id,
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
