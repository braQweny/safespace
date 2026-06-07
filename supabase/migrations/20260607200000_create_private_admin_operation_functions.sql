create function public.get_private_admin_overview()
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

create function public.list_private_admin_users(
  input_email_search text default null,
  input_status_filter text default 'all',
  input_sort text default 'created_desc',
  input_page integer default 1,
  input_page_size integer default 20
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

grant execute on function public.get_private_admin_overview() to authenticated;
grant execute on function public.list_private_admin_users(text, text, text, integer, integer) to authenticated;
