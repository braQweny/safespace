-- Nowe RPC są addytywne: starszy Worker zachowuje get/save_avatar_memory_work.
-- Wszystkie wersje dzielą rewizję pamięci i kursory, więc można je wdrażać kolejno.
create function public.get_avatar_memory_batch(p_avatar_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_max_chars constant integer := 48000;
  v_max_messages constant integer := 128;
  v_memory public.avatar_memories;
  v_message record;
  v_messages jsonb := '[]'::jsonb;
  v_used_chars integer := 0;
  v_take integer;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.avatar_memories(user_id, avatar_id) values (auth.uid(), p_avatar_id)
    on conflict do nothing;
  select * into strict v_memory from public.avatar_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id;

  for v_message in
    select s.id as session_id, m.role, m.sequence_index,
      case when m.sequence_index = c.sequence_index then c.character_offset else 0 end as start_offset,
      substring(m.content from
        (case when m.sequence_index = c.sequence_index then c.character_offset else 0 end) + 1
        for v_max_chars) as content
    from public.therapy_sessions s
    left join public.avatar_memory_sources c
      on c.user_id = s.user_id and c.avatar_id = s.avatar_id and c.session_id = s.id
    join public.session_messages m on m.session_id = s.id and m.user_id = s.user_id
    where s.user_id = auth.uid() and s.avatar_id = p_avatar_id and s.deleted_at is null
      and (s.status in ('completed', 'expired', 'interrupted') or (s.status = 'active' and s.expires_at <= now()))
      and exists (select 1 from public.session_messages u
        where u.session_id = s.id and u.user_id = s.user_id and u.role = 'user')
      and m.role in ('user', 'assistant') and length(m.content) > 0
      and (m.sequence_index > coalesce(c.sequence_index, -1)
        or (m.sequence_index = c.sequence_index and length(m.content) > c.character_offset))
    order by s.created_at, s.id, m.sequence_index
    limit v_max_messages
  loop
    v_take := least(length(v_message.content), v_max_chars - v_used_chars);
    v_messages := v_messages || jsonb_build_array(jsonb_build_object(
      'sessionId', v_message.session_id, 'role', v_message.role,
      'sequenceIndex', v_message.sequence_index,
      'characterOffset', v_message.start_offset + v_take,
      'content', substring(v_message.content from 1 for v_take)
    ));
    v_used_chars := v_used_chars + v_take;
    exit when v_used_chars = v_max_chars;
  end loop;
  return jsonb_build_object('revision', v_memory.revision, 'summaryText', v_memory.summary_text, 'messages', v_messages);
end $$;

create function public.save_avatar_memory_batch(
  p_avatar_id text, p_revision uuid, p_cursors jsonb, p_summary_text text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_cursor record;
  v_session public.therapy_sessions;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_summary_text is null or length(btrim(p_summary_text)) = 0 or length(p_summary_text) > 6000
    or p_cursors is null or jsonb_typeof(p_cursors) <> 'array' then return false; end if;
  if jsonb_array_length(p_cursors) not between 1 and 128 then return false; end if;
  if (select count(distinct x."sessionId") from jsonb_to_recordset(p_cursors) as x("sessionId" uuid))
    <> jsonb_array_length(p_cursors) then return false; end if;

  -- Najpierw blokujemy WSZYSTKIE źródła w stałej kolejności, potem pamięć.
  -- Usuwanie i starszy zapis też zaczynają od sesji. Walidacja kończy się
  -- przed pierwszym zapisem: niedostępne źródło odrzuca całą partię.
  for v_cursor in
    select * from jsonb_to_recordset(p_cursors)
      as x("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer)
    order by x."sessionId"
  loop
    select * into v_session from public.therapy_sessions
      where id = v_cursor."sessionId" and user_id = auth.uid() for update;
    if not found or v_session.avatar_id is distinct from p_avatar_id or v_session.deleted_at is not null
      or not (v_session.status in ('completed', 'expired', 'interrupted')
        or (v_session.status = 'active' and v_session.expires_at <= now())) then return false; end if;
    if not exists (select 1 from public.session_messages m
      where m.session_id = v_cursor."sessionId" and m.user_id = auth.uid()
        and m.sequence_index = v_cursor."sequenceIndex" and m.role in ('user', 'assistant')
        and v_cursor."characterOffset" > 0 and v_cursor."characterOffset" <= length(m.content)) then return false; end if;
    if exists (select 1 from public.avatar_memory_sources c
      where c.user_id = auth.uid() and c.avatar_id = p_avatar_id and c.session_id = v_cursor."sessionId"
        and (c.sequence_index, c.character_offset) >= (v_cursor."sequenceIndex", v_cursor."characterOffset")) then return false; end if;
  end loop;

  update public.avatar_memories set summary_text = p_summary_text, revision = gen_random_uuid()
    where user_id = auth.uid() and avatar_id = p_avatar_id and revision = p_revision;
  if not found then return false; end if;
  insert into public.avatar_memory_sources(user_id, avatar_id, session_id, sequence_index, character_offset)
    select auth.uid(), p_avatar_id, x."sessionId", x."sequenceIndex", x."characterOffset"
    from jsonb_to_recordset(p_cursors) as x("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer)
    on conflict (user_id, avatar_id, session_id) do update
      set sequence_index = excluded.sequence_index, character_offset = excluded.character_offset;
  return true;
end $$;

revoke all on function public.get_avatar_memory_batch(text), public.save_avatar_memory_batch(text, uuid, jsonb, text)
  from public, anon;
grant execute on function public.get_avatar_memory_batch(text), public.save_avatar_memory_batch(text, uuid, jsonb, text)
  to authenticated;
