-- Karty osób, etap 3: dwa rodzaje wpisów na osi czasu. `attempt` to konkretny
-- krok wobec tej osoby, na który użytkownik wyraźnie się zgodził („uzgodniona
-- próba”); `outcome` to to, co użytkownik później opowiedział o rezultacie
-- („późniejszy rezultat”). Migracja jest addytywna: rozszerza CHECK, zastępuje
-- zapis partii (te same sygnatury, te same granty) i render briefu, w którym
-- próba i rezultat idą zaraz po „kim jest”, żeby awatar mógł spytać, jak
-- poszło. Stary Worker nadal zapisuje cztery dotychczasowe rodzaje.

alter table public.people_facts drop constraint people_facts_kind_check;
alter table public.people_facts add constraint people_facts_kind_check
  check (kind in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome'));

-- 1. Zapis partii: te same reguły co w 20260906120000, lista rodzajów o dwa
-- dłuższa. Rezultat nigdy nie zastępuje próby — to zawsze nowy wpis (prompt).
create or replace function public.save_people_memory_batch(
  p_avatar_id text, p_revision uuid, p_cursors jsonb, p_changes jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_max_persons constant integer := 40;
  v_max_facts constant integer := 12;
  v_cursor record;
  v_session public.therapy_sessions;
  v_person_row public.people_persons;
  v_old_fact public.people_facts;
  v_entry jsonb;
  v_fact jsonb;
  v_person_id uuid;
  v_fact_id uuid;
  v_source_id uuid;
  v_count integer;
  v_name text;
  v_relation text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_cursors is null or jsonb_typeof(p_cursors) <> 'array' or jsonb_array_length(p_cursors) not between 1 and 128
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or jsonb_typeof(coalesce(p_changes->'newPersons', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_changes->'updates', '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_people_memory_changes' using errcode = '22023';
  end if;
  if (select count(distinct x."sessionId") from jsonb_to_recordset(p_cursors) as x("sessionId" uuid))
    <> jsonb_array_length(p_cursors) then return false; end if;

  -- Sesje źródłowe w stałej kolejności, walidacja jak przy pamięci.
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
    if exists (select 1 from public.people_memory_sources c
      where c.user_id = auth.uid() and c.avatar_id = p_avatar_id and c.session_id = v_cursor."sessionId"
        and (c.sequence_index, c.character_offset) >= (v_cursor."sequenceIndex", v_cursor."characterOffset")) then return false; end if;
  end loop;

  -- Każde źródło w zmianach musi pochodzić z tej partii.
  if exists (
    select 1 from (
      select f->>'sourceSessionId' as sid
        from jsonb_array_elements(coalesce(p_changes->'newPersons', '[]'::jsonb)) np,
          jsonb_array_elements(coalesce(np->'facts', '[]'::jsonb)) f
      union all select np->>'relationSourceSessionId'
        from jsonb_array_elements(coalesce(p_changes->'newPersons', '[]'::jsonb)) np
        where np ? 'relationSourceSessionId' and jsonb_typeof(np->'relationSourceSessionId') = 'string'
      union all select f->>'sourceSessionId'
        from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb)) u,
          jsonb_array_elements(coalesce(u->'addFacts', '[]'::jsonb)) f
      union all select f->>'sourceSessionId'
        from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb)) u,
          jsonb_array_elements(coalesce(u->'replaceFacts', '[]'::jsonb)) f
      union all select u->>'relationSourceSessionId'
        from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb)) u
        where u ? 'relationSourceSessionId' and jsonb_typeof(u->'relationSourceSessionId') = 'string'
      union all select m #>> '{}'
        from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb)) u,
          jsonb_array_elements(coalesce(u->'mentionedSessionIds', '[]'::jsonb)) m
    ) refs
    where refs.sid is null or not exists (
      select 1 from jsonb_to_recordset(p_cursors) as x("sessionId" uuid) where x."sessionId"::text = refs.sid)
  ) then raise exception 'unknown_people_memory_source' using errcode = '22023'; end if;

  -- Wyłączenie w trakcie generowania: nic nie zapisujemy, kursory stoją.
  if not private.people_memory_enabled() then return false; end if;
  perform 1 from public.people_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id and revision = p_revision for update;
  if not found then return false; end if;

  -- Aktualizacje istniejących osób.
  for v_entry in select * from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb)) loop
    if jsonb_typeof(v_entry->'personId') <> 'string' then continue; end if;
    select * into v_person_row from public.people_persons
      where id::text = v_entry->>'personId' and user_id = auth.uid() and avatar_id = p_avatar_id;
    if not found then continue; end if;
    v_person_id := v_person_row.id;

    if not v_person_row.relation_locked and jsonb_typeof(v_entry->'relation') = 'string' then
      v_relation := nullif(btrim(v_entry->>'relation'), '');
      if v_relation is not null and length(v_relation) <= 80 then
        update public.people_persons set relation = v_relation,
          relation_source_session_id = (v_entry->>'relationSourceSessionId')::uuid
          where id = v_person_id;
      end if;
    end if;

    delete from public.people_facts f
      where f.person_id = v_person_id and f.user_id = auth.uid() and not f.user_edited
        and f.id::text in (select m #>> '{}' from jsonb_array_elements(coalesce(v_entry->'removeFactIds', '[]'::jsonb)) m);

    for v_fact in select * from jsonb_array_elements(coalesce(v_entry->'replaceFacts', '[]'::jsonb)) loop
      if jsonb_typeof(v_fact->'factId') <> 'string'
        or coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome')
        or length(btrim(coalesce(v_fact->>'text', ''))) = 0 or length(v_fact->>'text') > 200 then continue; end if;
      select * into v_old_fact from public.people_facts
        where id::text = v_fact->>'factId' and person_id = v_person_id and user_id = auth.uid();
      if not found or v_old_fact.user_edited then continue; end if;
      insert into public.people_facts(person_id, user_id, avatar_id, kind, text)
        values (v_person_id, auth.uid(), p_avatar_id, v_fact->>'kind', btrim(v_fact->>'text'))
        returning id into v_fact_id;
      insert into public.people_fact_sources(fact_id, session_id, user_id)
        select v_fact_id, s.session_id, auth.uid() from public.people_fact_sources s where s.fact_id = v_old_fact.id
        on conflict do nothing;
      insert into public.people_fact_sources(fact_id, session_id, user_id)
        values (v_fact_id, (v_fact->>'sourceSessionId')::uuid, auth.uid())
        on conflict do nothing;
      delete from public.people_facts where id = v_old_fact.id;
    end loop;

    for v_fact in select * from jsonb_array_elements(coalesce(v_entry->'addFacts', '[]'::jsonb)) loop
      select count(*) into v_count from public.people_facts where person_id = v_person_id;
      exit when v_count >= v_max_facts;
      if coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome')
        or length(btrim(coalesce(v_fact->>'text', ''))) = 0 or length(v_fact->>'text') > 200 then continue; end if;
      insert into public.people_facts(person_id, user_id, avatar_id, kind, text)
        values (v_person_id, auth.uid(), p_avatar_id, v_fact->>'kind', btrim(v_fact->>'text'))
        returning id into v_fact_id;
      insert into public.people_fact_sources(fact_id, session_id, user_id)
        values (v_fact_id, (v_fact->>'sourceSessionId')::uuid, auth.uid());
    end loop;

    insert into public.people_person_mentions(person_id, session_id, user_id, mentioned_at)
      select v_person_id, s.id, auth.uid(), s.created_at
      from jsonb_array_elements(coalesce(v_entry->'mentionedSessionIds', '[]'::jsonb)) m
      join public.therapy_sessions s on s.id::text = (m #>> '{}') and s.user_id = auth.uid()
      on conflict do nothing;
  end loop;

  -- Nowe osoby.
  for v_entry in select * from jsonb_array_elements(coalesce(p_changes->'newPersons', '[]'::jsonb)) loop
    v_name := btrim(coalesce(v_entry->>'name', ''));
    if length(v_name) = 0 or length(v_name) > 60 then continue; end if;
    v_relation := nullif(btrim(coalesce(v_entry->>'relation', '')), '');
    if v_relation is not null and length(v_relation) > 80 then v_relation := null; end if;
    -- Zapomniana osoba: przy zgodnej lub nieznanej relacji nie zapisujemy.
    if exists (select 1 from public.people_exclusions e
      where e.user_id = auth.uid() and e.avatar_id = p_avatar_id
        and e.name_normalized = private.normalize_person_name(v_name)
        and (e.relation_normalized is null or v_relation is null
          or e.relation_normalized = private.normalize_person_name(v_relation))) then continue; end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(v_entry->'facts', '[]'::jsonb)) f
      where coalesce(f->>'kind', '') in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome')
        and length(btrim(coalesce(f->>'text', ''))) between 1 and 200) then continue; end if;
    select count(*) into v_count from public.people_persons where user_id = auth.uid() and avatar_id = p_avatar_id;
    exit when v_count >= v_max_persons;

    insert into public.people_persons(user_id, avatar_id, display_name, relation, relation_source_session_id)
      values (auth.uid(), p_avatar_id, v_name, v_relation,
        case when v_relation is null then null else (v_entry->>'relationSourceSessionId')::uuid end)
      returning id into v_person_id;
    for v_fact in select * from jsonb_array_elements(coalesce(v_entry->'facts', '[]'::jsonb)) loop
      select count(*) into v_count from public.people_facts where person_id = v_person_id;
      exit when v_count >= v_max_facts;
      if coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish', 'attempt', 'outcome')
        or length(btrim(coalesce(v_fact->>'text', ''))) = 0 or length(v_fact->>'text') > 200 then continue; end if;
      v_source_id := (v_fact->>'sourceSessionId')::uuid;
      insert into public.people_facts(person_id, user_id, avatar_id, kind, text)
        values (v_person_id, auth.uid(), p_avatar_id, v_fact->>'kind', btrim(v_fact->>'text'))
        returning id into v_fact_id;
      insert into public.people_fact_sources(fact_id, session_id, user_id) values (v_fact_id, v_source_id, auth.uid());
      insert into public.people_person_mentions(person_id, session_id, user_id, mentioned_at)
        select v_person_id, s.id, auth.uid(), s.created_at from public.therapy_sessions s
        where s.id = v_source_id and s.user_id = auth.uid()
        on conflict do nothing;
    end loop;
  end loop;

  perform private.prune_empty_people(auth.uid(), p_avatar_id);
  insert into public.people_memory_sources(user_id, avatar_id, session_id, sequence_index, character_offset)
    select auth.uid(), p_avatar_id, x."sessionId", x."sequenceIndex", x."characterOffset"
    from jsonb_to_recordset(p_cursors) as x("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer)
    on conflict (user_id, avatar_id, session_id) do update
      set sequence_index = excluded.sequence_index, character_offset = excluded.character_offset;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = p_avatar_id;
  return true;
end $$;

-- 2. Brief: na osobę najnowszy wpis każdego rodzaju, w priorytecie
-- who > attempt > outcome > wish > account > feeling, do pięciu wpisów —
-- przy komplecie sześciu rodzajów odpada najstarszy priorytetowo „feeling”,
-- bo próba bez rezultatu jest tym, o co awatar ma zapytać.
create or replace function private.render_people_brief(p_avatar_id text, p_about_person_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_brief_max_chars constant integer := 6000;
  v_brief_max_persons constant integer := 10;
  v_brief_max_facts constant integer := 5;
  v_person record;
  v_fact record;
  v_block text;
  v_brief text := '';
  v_count integer := 0;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if not private.people_memory_enabled() then return null; end if;
  for v_person in
    select p.id, p.display_name, p.relation, p.user_note, (p.id = p_about_person_id) as is_about,
      (select max(m.mentioned_at) from public.people_person_mentions m where m.person_id = p.id) as last_mentioned,
      (select count(*) from public.people_person_mentions m where m.person_id = p.id) as mention_count
    from public.people_persons p
    where p.user_id = auth.uid() and p.avatar_id = p_avatar_id
    order by (p.id = p_about_person_id) desc, last_mentioned desc nulls last, p.created_at desc, p.id
  loop
    exit when v_count >= v_brief_max_persons;
    v_block := '- ' || v_person.display_name
      || case when v_person.relation is not null then ' (' || v_person.relation || ')' else '' end
      || case when v_person.is_about then ' — the user chose to talk about this person today' else '' end
      || case when v_person.mention_count > 0
           then '; mentioned in ' || v_person.mention_count || ' earlier conversation(s)' else '' end
      || E'\n';
    if length(v_person.user_note) > 0 then
      v_block := v_block || '  user''s own note: ' || left(v_person.user_note, 300) || E'\n';
    end if;
    for v_fact in
      select x.kind, x.text from (
        select distinct on (f.kind) f.kind, f.text, f.created_at from public.people_facts f
        where f.person_id = v_person.id order by f.kind, f.created_at desc, f.id
      ) x
      order by case x.kind
        when 'who' then 0 when 'attempt' then 1 when 'outcome' then 2 when 'wish' then 3 when 'account' then 4 else 5 end
      limit v_brief_max_facts
    loop
      v_block := v_block || '  ' || case v_fact.kind
        when 'who' then 'who they are to the user: '
        when 'attempt' then 'something the user agreed to try: '
        when 'outcome' then 'what the user later said came of it: '
        when 'account' then 'what the user said happened: '
        when 'feeling' then 'how the user feels about it: '
        else 'what the user would like to change: ' end || v_fact.text || E'\n';
    end loop;
    exit when length(v_brief) + length(v_block) > v_brief_max_chars;
    v_brief := v_brief || v_block;
    v_count := v_count + 1;
  end loop;
  return nullif(btrim(v_brief), '');
end $$;
