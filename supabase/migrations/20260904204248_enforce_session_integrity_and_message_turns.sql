-- Additive rollout: old Workers can still insert ordinary messages. The
-- triggers enforce the same lifecycle and content rules for that path too.
create function public.enforce_session_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'created' then
      raise exception 'invalid_lifecycle_transition' using errcode = 'P0004';
    end if;
  elsif new.status is distinct from old.status then
    if not (
      (old.status = 'created' and new.status in ('active', 'expired', 'interrupted', 'deleted'))
      or (old.status = 'active' and new.status in ('completed', 'expired', 'interrupted', 'deleted'))
      or (old.status in ('completed', 'expired', 'interrupted') and new.status = 'deleted')
    ) then
      raise exception 'invalid_lifecycle_transition' using errcode = 'P0004';
    end if;

    -- A forged future start or a missing deadline must not create an
    -- effectively unlimited conversation through the direct Data API.
    if new.status = 'active' and (
      new.started_at is null or new.expires_at is null
      or coalesce(new.duration_bucket_seconds, 0) <= 0
      or new.started_at > clock_timestamp() + interval '5 seconds'
      or new.expires_at > clock_timestamp()
        + make_interval(secs => new.duration_bucket_seconds) + interval '5 seconds'
    ) then
      raise exception 'invalid_session_budget' using errcode = 'P0006';
    end if;
  end if;
  return new;
end;
$$;

create trigger therapy_sessions_enforce_lifecycle
  before insert or update on public.therapy_sessions
  for each row execute function public.enforce_session_lifecycle();

-- Lock the parent even for legacy direct inserts. Closing/deleting and adding
-- content now serialize on the same row; no late insert can revive content
-- after the tombstone purge. Summaries are allowed after a conversation ends.
create function public.guard_session_content_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.therapy_sessions;
begin
  select * into v_session from public.therapy_sessions
  where id = new.session_id and user_id = (select auth.uid())
    and user_id = new.user_id
  for update;
  if not found or v_session.status = 'deleted' then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if tg_table_name = 'session_messages' then
    if v_session.status <> 'active' then
      raise exception 'session_not_active' using errcode = 'P0004';
    end if;
    if v_session.expires_at is null or v_session.expires_at <= clock_timestamp() then
      raise exception 'session_expired' using errcode = 'P0007';
    end if;
  end if;
  return new;
end;
$$;

create trigger session_messages_guard_insert
  before insert on public.session_messages
  for each row execute function public.guard_session_content_insert();
create trigger session_summaries_guard_insert
  before insert on public.session_summaries
  for each row execute function public.guard_session_content_insert();

-- Private idempotency receipts, never an admin/operational data source.
-- No duplicate message bodies: completed receipts reference the transcript.
create table public.session_message_turns (
  session_id uuid not null,
  user_id uuid not null,
  client_message_id uuid not null,
  message_hash text not null,
  attempt_id uuid not null,
  lease_until timestamptz not null,
  user_message_id uuid references public.session_messages(id) on delete cascade,
  assistant_message_id uuid references public.session_messages(id) on delete cascade,
  response_type text check (response_type in ('success', 'caution')),
  primary key (session_id, client_message_id),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade,
  check (
    (user_message_id is null and assistant_message_id is null and response_type is null)
    or (user_message_id is not null and assistant_message_id is not null and response_type is not null)
  )
);
create index session_message_turns_user_idx on public.session_message_turns(user_id);
create index session_message_turns_user_message_idx on public.session_message_turns(user_message_id);
create index session_message_turns_assistant_message_idx on public.session_message_turns(assistant_message_id);
alter table public.session_message_turns enable row level security;
revoke all on public.session_message_turns from anon, authenticated;
grant select, insert, update, delete on public.session_message_turns to authenticated;
create policy "Owners read their message turns" on public.session_message_turns
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners create their message turns" on public.session_message_turns
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners update their message turns" on public.session_message_turns
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their message turns" on public.session_message_turns
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger session_message_turns_guard_insert
  before insert on public.session_message_turns
  for each row execute function public.guard_session_content_insert();

create function public.claim_session_message_turn(p_session_id uuid, p_client_message_id uuid, p_message text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.therapy_sessions;
  v_turn public.session_message_turns;
  v_hash text := encode(extensions.digest(p_message, 'sha256'), 'hex');
  v_attempt uuid := gen_random_uuid();
begin
  if p_client_message_id is null or p_message is null or length(btrim(p_message)) not between 1 and 3000 then
    raise exception 'invalid_message_request' using errcode = '22023';
  end if;
  select * into v_session from public.therapy_sessions
  where id = p_session_id and user_id = (select auth.uid()) for update;
  if not found or v_session.status = 'deleted' then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  select * into v_turn from public.session_message_turns
  where session_id = p_session_id and client_message_id = p_client_message_id and user_id = (select auth.uid());
  if found then
    if v_turn.message_hash <> v_hash then
      raise exception 'message_request_conflict' using errcode = 'P0009';
    end if;
    if v_turn.response_type is not null then
      return jsonb_build_object('kind', 'completed', 'response_type', v_turn.response_type,
        'messages', (select jsonb_agg(to_jsonb(m) order by m.sequence_index) from public.session_messages m
          where m.user_id = (select auth.uid()) and m.session_id = p_session_id
            and m.id in (v_turn.user_message_id, v_turn.assistant_message_id)));
    end if;
  end if;

  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0004';
  end if;
  if v_session.expires_at is null or v_session.expires_at <= clock_timestamp() then
    raise exception 'session_expired' using errcode = 'P0007';
  end if;
  -- One generation at a time per session, including requests from other tabs.
  if exists (select 1 from public.session_message_turns
    where session_id = p_session_id and user_id = (select auth.uid())
      and response_type is null and lease_until > clock_timestamp()) then
    raise exception 'message_in_progress' using errcode = 'P0008';
  end if;

  -- Expired unfinished attempts contain no transcript; bounded cleanup also
  -- prevents abandoned requests from accumulating indefinitely.
  delete from public.session_message_turns
  where session_id = p_session_id and user_id = (select auth.uid()) and response_type is null;
  insert into public.session_message_turns
    (session_id, user_id, client_message_id, message_hash, attempt_id, lease_until)
  values (p_session_id, (select auth.uid()), p_client_message_id, v_hash, v_attempt,
    clock_timestamp() + interval '2 minutes');
  return jsonb_build_object('kind', 'claimed', 'attempt_id', v_attempt);
end;
$$;

create function public.complete_session_message_turn(
  p_session_id uuid, p_client_message_id uuid, p_attempt_id uuid,
  p_user_message text, p_assistant_message text, p_response_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.therapy_sessions;
  v_turn public.session_message_turns;
  v_index integer;
  v_user public.session_messages;
  v_assistant public.session_messages;
begin
  select * into v_session from public.therapy_sessions
  where id = p_session_id and user_id = (select auth.uid()) for update;
  if not found or v_session.status = 'deleted' then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  select * into v_turn from public.session_message_turns
  where session_id = p_session_id and client_message_id = p_client_message_id and user_id = (select auth.uid());
  if not found or v_turn.attempt_id is distinct from p_attempt_id then
    raise exception 'message_request_conflict' using errcode = 'P0009';
  end if;
  if p_user_message is null or v_turn.message_hash <> encode(extensions.digest(p_user_message, 'sha256'), 'hex') then
    raise exception 'message_request_conflict' using errcode = 'P0009';
  end if;
  if v_turn.response_type is not null then
    return jsonb_build_object('messages', (select jsonb_agg(to_jsonb(m) order by m.sequence_index)
      from public.session_messages m where m.user_id = (select auth.uid()) and m.session_id = p_session_id
        and m.id in (v_turn.user_message_id, v_turn.assistant_message_id)));
  end if;
  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0004';
  end if;
  if v_session.expires_at is null or v_session.expires_at <= clock_timestamp() then
    raise exception 'session_expired' using errcode = 'P0007';
  end if;
  if v_turn.lease_until <= clock_timestamp() then
    raise exception 'message_request_conflict' using errcode = 'P0009';
  end if;
  if p_response_type is null or p_response_type not in ('success', 'caution')
    or p_assistant_message is null or length(btrim(p_assistant_message)) = 0 then
    raise exception 'invalid_message_response' using errcode = '22023';
  end if;

  select coalesce(max(sequence_index) + 1, 0) into v_index from public.session_messages
  where session_id = p_session_id and user_id = (select auth.uid());
  insert into public.session_messages(session_id, user_id, role, sequence_index, content)
  values (p_session_id, (select auth.uid()), 'user', v_index, p_user_message) returning * into v_user;
  insert into public.session_messages(session_id, user_id, role, sequence_index, content)
  values (p_session_id, (select auth.uid()), 'assistant', v_index + 1, p_assistant_message) returning * into v_assistant;
  update public.session_message_turns set user_message_id = v_user.id, assistant_message_id = v_assistant.id,
    response_type = p_response_type
  where session_id = p_session_id and client_message_id = p_client_message_id and user_id = (select auth.uid());
  return jsonb_build_object('messages', jsonb_build_array(to_jsonb(v_user), to_jsonb(v_assistant)));
end;
$$;

create function public.release_session_message_turn(p_session_id uuid, p_client_message_id uuid, p_attempt_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  delete from public.session_message_turns
  where session_id = p_session_id and client_message_id = p_client_message_id
    and user_id = (select auth.uid()) and attempt_id = p_attempt_id and response_type is null;
$$;

-- In-flight receipts have no message FK yet, so purge them explicitly too.
create or replace function public.purge_tombstoned_session_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.session_message_turns where session_id = new.id and user_id = new.user_id;
  delete from public.session_messages where session_id = new.id and user_id = new.user_id;
  delete from public.session_summaries where session_id = new.id and user_id = new.user_id;
  return null;
end;
$$;

revoke execute on function public.enforce_session_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_session_content_insert() from public, anon, authenticated;
revoke execute on function public.purge_tombstoned_session_content() from public, anon, authenticated;
revoke execute on function public.claim_session_message_turn(uuid, uuid, text) from public, anon;
revoke execute on function public.complete_session_message_turn(uuid, uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.release_session_message_turn(uuid, uuid, uuid) from public, anon;
grant execute on function public.claim_session_message_turn(uuid, uuid, text) to authenticated;
grant execute on function public.complete_session_message_turn(uuid, uuid, uuid, text, text, text) to authenticated;
grant execute on function public.release_session_message_turn(uuid, uuid, uuid) to authenticated;
