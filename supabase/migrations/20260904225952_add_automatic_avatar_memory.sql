-- Automatyczna, prywatna pamięć awatara. Surowe wiadomości są czytane partiami;
-- do następnej sesji trafia wyłącznie ograniczone podsumowanie.
alter table public.therapy_sessions add column uses_avatar_memory boolean not null default false;
grant insert (uses_avatar_memory) on public.therapy_sessions to authenticated;

create table public.avatar_memories (
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null check (avatar_id in (
    'psychodynamic-listener', 'cbt-guide', 'experiential-companion', 'systemic-connector', 'integrative-guide'
  )),
  summary_text text not null default '' check (length(summary_text) <= 6000),
  revision uuid not null default gen_random_uuid(),
  primary key (user_id, avatar_id)
);

create table public.avatar_memory_sources (
  user_id uuid not null,
  avatar_id text not null,
  session_id uuid not null,
  sequence_index integer not null check (sequence_index >= 0),
  character_offset integer not null check (character_offset >= 0),
  primary key (user_id, avatar_id, session_id),
  foreign key (user_id, avatar_id) references public.avatar_memories(user_id, avatar_id) on delete cascade,
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);

create table public.avatar_session_contexts (
  session_id uuid primary key,
  user_id uuid not null,
  avatar_id text not null,
  summary_text text not null check (length(summary_text) <= 6000),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);

alter table public.avatar_memories enable row level security;
alter table public.avatar_memory_sources enable row level security;
alter table public.avatar_session_contexts enable row level security;
revoke all on public.avatar_memories, public.avatar_memory_sources, public.avatar_session_contexts from anon, authenticated;
grant select, insert, update, delete on public.avatar_memories, public.avatar_memory_sources, public.avatar_session_contexts to authenticated;

-- SECURITY INVOKER: RPC i triggery korzystają z tych samych reguł właściciela.
do $$
declare t text;
begin
  foreach t in array array['avatar_memories', 'avatar_memory_sources', 'avatar_session_contexts'] loop
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

create index therapy_sessions_avatar_memory_idx on public.therapy_sessions(user_id, avatar_id, created_at, id)
  where status <> 'deleted';

create function public.get_avatar_memory_work(p_avatar_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_memory public.avatar_memories;
  v_session_id uuid;
  v_sequence integer;
  v_offset integer;
  v_messages jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.avatar_memories(user_id, avatar_id) values (auth.uid(), p_avatar_id)
    on conflict do nothing;
  select * into strict v_memory from public.avatar_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id;

  select s.id, coalesce(c.sequence_index, -1), coalesce(c.character_offset, 0)
    into v_session_id, v_sequence, v_offset
  from public.therapy_sessions s
  left join public.avatar_memory_sources c
    on c.user_id = s.user_id and c.avatar_id = s.avatar_id and c.session_id = s.id
  where s.user_id = auth.uid() and s.avatar_id = p_avatar_id and s.deleted_at is null
    and (s.status in ('completed', 'expired', 'interrupted') or (s.status = 'active' and s.expires_at <= now()))
    -- Samo otwarcie awatara bez wypowiedzi użytkownika nie tworzy pamięci.
    and exists (select 1 from public.session_messages u where u.session_id = s.id and u.user_id = s.user_id and u.role = 'user')
    and exists (
      select 1 from public.session_messages m where m.session_id = s.id and m.user_id = s.user_id
        and m.role in ('user', 'assistant') and length(m.content) > 0
        and (m.sequence_index > coalesce(c.sequence_index, -1)
          or (m.sequence_index = c.sequence_index and length(m.content) > c.character_offset))
    )
  order by s.created_at, s.id limit 1;

  if v_session_id is not null then
    select coalesce(jsonb_agg(to_jsonb(m) order by m."sequenceIndex"), '[]'::jsonb) into v_messages from (
      select role, content, sequence_index as "sequenceIndex"
      from public.session_messages
      where user_id = auth.uid() and session_id = v_session_id and role in ('user', 'assistant') and length(content) > 0
        and (sequence_index > v_sequence or (sequence_index = v_sequence and length(content) > v_offset))
      order by sequence_index limit 16
    ) m;
  end if;

  return jsonb_build_object('revision', v_memory.revision, 'summaryText', v_memory.summary_text,
    'sessionId', v_session_id, 'sequenceIndex', coalesce(v_sequence, -1),
    'characterOffset', coalesce(v_offset, 0), 'messages', coalesce(v_messages, '[]'::jsonb));
end $$;

create function public.save_avatar_memory_work(
  p_avatar_id text, p_revision uuid, p_session_id uuid,
  p_sequence_index integer, p_character_offset integer, p_summary_text text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_session public.therapy_sessions;
begin
  -- Ta sama kolejność blokad co przy usuwaniu: sesja, potem pamięć.
  select * into v_session from public.therapy_sessions
    where id = p_session_id and user_id = auth.uid() for update;
  if not found or v_session.avatar_id is distinct from p_avatar_id or v_session.deleted_at is not null
    or not (v_session.status in ('completed', 'expired', 'interrupted')
      or (v_session.status = 'active' and v_session.expires_at <= now())) then return false; end if;
  if length(btrim(p_summary_text)) = 0 or length(p_summary_text) > 6000 then return false; end if;
  if not exists (select 1 from public.session_messages where session_id = p_session_id and user_id = auth.uid()
    and sequence_index = p_sequence_index and role in ('user', 'assistant')
    and p_character_offset > 0 and p_character_offset <= length(content)) then return false; end if;

  update public.avatar_memories set summary_text = p_summary_text, revision = gen_random_uuid()
    where user_id = auth.uid() and avatar_id = p_avatar_id and revision = p_revision;
  if not found then return false; end if;
  insert into public.avatar_memory_sources(user_id, avatar_id, session_id, sequence_index, character_offset)
    values (auth.uid(), p_avatar_id, p_session_id, p_sequence_index, p_character_offset)
    on conflict (user_id, avatar_id, session_id) do update
      set sequence_index = excluded.sequence_index, character_offset = excluded.character_offset;
  return true;
end $$;

-- Kopia kontekstu jest przypięta do nowej sesji: późniejsze rozmowy nie zmieniają jej pamięci.
create function public.attach_avatar_session_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_work jsonb;
begin
  if not new.uses_avatar_memory then return new; end if;
  if not new.uses_approved_context or new.avatar_id is null then raise exception 'invalid_avatar_memory_start' using errcode = 'P0011'; end if;
  -- Blokada pamięci obejmuje sprawdzenie kompletności i skopiowanie kontekstu.
  insert into public.avatar_memories(user_id, avatar_id) values (new.user_id, new.avatar_id) on conflict do nothing;
  perform 1 from public.avatar_memories where user_id = new.user_id and avatar_id = new.avatar_id for update;
  v_work := public.get_avatar_memory_work(new.avatar_id);
  if v_work->>'sessionId' is not null then raise exception 'avatar_memory_not_ready' using errcode = 'P0011'; end if;
  insert into public.avatar_session_contexts(session_id, user_id, avatar_id, summary_text)
    values (new.id, new.user_id, new.avatar_id, v_work->>'summaryText');
  return new;
end $$;
create trigger therapy_sessions_attach_avatar_memory after insert on public.therapy_sessions
  for each row execute function public.attach_avatar_session_context();

create or replace function public.invalidate_deleted_avatar_memory()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Kaskada auth.users usuwa już całą pamięć i jej kopie przez FK. Rola
  -- supabase_auth_admin nie ma (i nie potrzebuje) dostępu do prywatnych tabel.
  if tg_op = 'DELETE' and current_user = 'supabase_auth_admin' then return null; end if;
  if old.avatar_id is null then return null; end if;
  update public.avatar_memories set summary_text = '', revision = gen_random_uuid()
    where user_id = old.user_id and avatar_id = old.avatar_id;
  delete from public.avatar_memory_sources where user_id = old.user_id and avatar_id = old.avatar_id;
  update public.avatar_session_contexts set summary_text = '' where user_id = old.user_id and avatar_id = old.avatar_id;
  if tg_op = 'UPDATE' then
    delete from public.avatar_session_contexts where session_id = old.id and user_id = old.user_id;
  end if;
  return null;
end $$;
create trigger therapy_sessions_invalidate_avatar_memory after update of status on public.therapy_sessions
  for each row when (new.status = 'deleted' and old.status <> 'deleted') execute function public.invalidate_deleted_avatar_memory();
create trigger therapy_sessions_delete_avatar_memory after delete on public.therapy_sessions
  for each row execute function public.invalidate_deleted_avatar_memory();

revoke all on function public.get_avatar_memory_work(text), public.save_avatar_memory_work(text, uuid, uuid, integer, integer, text),
  public.attach_avatar_session_context(), public.invalidate_deleted_avatar_memory() from public, anon;
grant execute on function public.get_avatar_memory_work(text), public.save_avatar_memory_work(text, uuid, uuid, integer, integer, text) to authenticated;
