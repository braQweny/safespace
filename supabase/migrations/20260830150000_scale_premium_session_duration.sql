-- Premium session length.
--
-- A session's time budget now follows the owner's account plan: free stays at
-- 15 minutes, premium gets 60. Two things in this schema pinned every trial to
-- 900 seconds and had to move for that:
--
--   1. `therapy_sessions_trial_duration_check` allowed only 900 whenever
--      `is_trial` was true. The very first session of *any* account — premium
--      included — is the one-per-user free-trial claim, so without this the
--      premium first conversation could not carry the longer budget.
--   2. `claim_free_trial_session()` hard-coded 900 on insert, so the route had
--      no way to say how long the claimed session should run.
--
-- The bucket list itself (0, 300, 900, 1800, 3600) already allowed 3600 and is
-- untouched; `schema-drift.test.ts` pins it to `SessionDurationBucketSeconds`.
--
-- Backward-compatible on purpose (CI applies migrations before deploying the
-- new code): the check only widens, and the new function parameter is trailing
-- with a 900 default, so the currently deployed four-argument call still
-- resolves and still produces a 15-minute trial.

alter table public.therapy_sessions
  drop constraint therapy_sessions_trial_duration_check;

-- Still a closed set rather than "anything from the bucket list": a trial is
-- either the 15-minute free-plan conversation or the 60-minute premium one.
alter table public.therapy_sessions
  add constraint therapy_sessions_trial_duration_check check (
    is_trial = false
    or duration_bucket_seconds is null
    or duration_bucket_seconds in (900, 3600)
  );

drop function public.claim_free_trial_session(text, text, timestamptz, timestamptz);

create function public.claim_free_trial_session(
  p_modality_id text default null,
  p_avatar_id text default null,
  p_started_at timestamptz default null,
  p_expires_at timestamptz default null,
  p_duration_bucket_seconds integer default 900
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
  -- Guard here as well as in the table constraint: this function is the only
  -- way a trial row is created, so an out-of-range budget should fail loudly
  -- instead of silently landing on whatever the caller passed.
  if p_duration_bucket_seconds is null or p_duration_bucket_seconds not in (900, 3600) then
    raise exception using errcode = '22023', message = 'invalid_trial_duration';
  end if;

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
    p_duration_bucket_seconds
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

-- Dropping the function dropped its grants with it; restore the same closed
-- set the original migration established.
revoke execute on function public.claim_free_trial_session(text, text, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.claim_free_trial_session(text, text, timestamptz, timestamptz, integer) to authenticated;
