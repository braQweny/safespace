-- Atomic session operations.
--
-- Two multi-step flows previously ran as separate client round-trips and could
-- leave partial state behind on mid-flight failure:
--   1. free-trial claim: pending session insert + trial claim insert
--      (a duplicate claim left an orphaned session row to best-effort cleanup),
--   2. session deletion: purge messages + purge summaries + tombstone update
--      (a failure between steps left a partially purged session).
-- Both now run inside a single transaction via owner-bound SQL functions.
-- Functions are SECURITY INVOKER on purpose: RLS policies on the private
-- session tables keep applying to the calling user.

create function public.claim_free_trial_session(
  p_modality_id text default null,
  p_avatar_id text default null,
  p_started_at timestamptz default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.therapy_sessions;
  v_claim public.session_trial_claims;
begin
  insert into public.therapy_sessions (
    user_id,
    modality_id,
    avatar_id,
    status,
    started_at,
    expires_at,
    is_trial,
    duration_bucket_seconds
  )
  values (
    (select auth.uid()),
    p_modality_id,
    p_avatar_id,
    'created',
    p_started_at,
    p_expires_at,
    true,
    900
  )
  returning * into v_session;

  -- Unique constraint on session_trial_claims.user_id makes this the real
  -- quota gate; a violation aborts the whole transaction, so no orphaned
  -- session row survives a duplicate claim.
  insert into public.session_trial_claims (session_id, user_id)
  values (v_session.id, (select auth.uid()))
  returning * into v_claim;

  select * into v_session
  from public.therapy_sessions
  where id = v_session.id;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'trial_claim', to_jsonb(v_claim)
  );
end;
$$;

create function public.delete_owned_session(
  p_session_id uuid,
  p_deletion_reason_code text,
  p_ended_at timestamptz default null,
  p_duration_bucket_seconds integer default null
)
returns public.therapy_sessions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.therapy_sessions;
begin
  select * into v_session
  from public.therapy_sessions
  where id = p_session_id
    and user_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status = 'deleted' then
    raise exception 'invalid_lifecycle_transition' using errcode = 'P0004';
  end if;

  delete from public.session_messages
  where session_id = p_session_id
    and user_id = (select auth.uid());

  delete from public.session_summaries
  where session_id = p_session_id
    and user_id = (select auth.uid());

  update public.therapy_sessions
  set status = 'deleted',
      ended_at = coalesce(p_ended_at, ended_at),
      deletion_reason_code = p_deletion_reason_code,
      duration_bucket_seconds = coalesce(p_duration_bucket_seconds, duration_bucket_seconds)
  where id = p_session_id
    and user_id = (select auth.uid())
  returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.claim_free_trial_session(text, text, timestamptz, timestamptz) from public, anon;
revoke execute on function public.delete_owned_session(uuid, text, timestamptz, integer) from public, anon;

grant execute on function public.claim_free_trial_session(text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_owned_session(uuid, text, timestamptz, integer) to authenticated;
