-- Mapa tematów, etap 4: brief trudności przypinany do rozmowy obok briefu
-- osób. Ta sama zasada co karty osób: prywatna kopia w
-- avatar_session_contexts, renderowana przy starcie (trudność wybrana na dziś
-- pierwsza), odświeżana po korektach użytkownika, zapomnieniu osoby i usunięciu
-- rozmowy, zerowana po wyłączeniu mapy. Zapis partii nie odświeża: brief jest
-- migawką na czas rozmowy. Tylko potwierdzone powiązania z osobami i trudności
-- nieoznaczone jako „mniej aktualne”; rezultat „rozwiązane” idzie z dopiskiem,
-- żeby awatar nie otwierał tematu bez powodu.

-- 1. Kolumna: brief do 3000 znaków, NULL = bez sekcji.
alter table public.avatar_session_contexts add column topic_brief_text text
  check (topic_brief_text is null or length(topic_brief_text) <= 3000);

-- 2. Renderer. Na trudność: etykieta, osoby (potwierdzone), notatka, stan na
-- dziś, najnowsze „jak to wygląda” i „jak sobie radzisz”, najnowsze propozycje
-- i postanowienia z najnowszym „jak poszło” każdego, rezultaty bez rodzica.
-- Rodzaj rezultatu jest wypisany słowami („made things worse”), bo na tym
-- opierają się reguły promptu odpowiedzi.
create function private.render_topic_brief(p_avatar_id text, p_about_difficulty_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_brief_max_chars constant integer := 3000;
  v_brief_max_difficulties constant integer := 8;
  v_brief_max_strategies constant integer := 4;
  v_brief_max_orphan_outcomes constant integer := 2;
  v_difficulty record;
  v_state record;
  v_entry record;
  v_strategy record;
  v_persons text;
  v_block text;
  v_brief text := '';
  v_count integer := 0;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if not private.topic_map_enabled() then return null; end if;
  for v_difficulty in
    select d.id, d.label, d.user_note, (d.id = p_about_difficulty_id) as is_about,
      (select max(m.mentioned_at) from public.difficulty_mentions m where m.difficulty_id = d.id) as last_mentioned,
      (select count(*) from public.difficulty_mentions m where m.difficulty_id = d.id) as mention_count
    from public.difficulties d
    where d.user_id = auth.uid() and d.avatar_id = p_avatar_id and d.archived_at is null
    order by (d.id = p_about_difficulty_id) desc, last_mentioned desc nulls last, d.created_at desc, d.id
  loop
    exit when v_count >= v_brief_max_difficulties;
    select string_agg(
        p.display_name || case when p.relation is not null then ' (' || p.relation || ')' else '' end,
        ', ' order by dp.created_at, dp.person_id)
      into v_persons
      from public.difficulty_persons dp join public.people_persons p on p.id = dp.person_id
      where dp.difficulty_id = v_difficulty.id and dp.state = 'confirmed';
    v_block := '- ' || v_difficulty.label
      || case when v_difficulty.is_about then ' — the user chose to talk about this today' else '' end
      || case when v_difficulty.mention_count > 0
           then '; came up in ' || v_difficulty.mention_count || ' earlier conversation(s)' else '' end
      || E'\n';
    if v_persons is not null then
      v_block := v_block || '  comes up with: ' || v_persons || E'\n';
    end if;
    if length(v_difficulty.user_note) > 0 then
      v_block := v_block || '  user''s own note: ' || left(v_difficulty.user_note, 300) || E'\n';
    end if;
    select e.text, e.effect into v_state from public.difficulty_entries e
      where e.difficulty_id = v_difficulty.id and e.kind = 'update'
      order by private.difficulty_entry_conversation_at(e.id) desc nulls last, e.created_at desc, e.id desc
      limit 1;
    if found then
      v_block := v_block || '  how it is now' || case v_state.effect
          when 'resolved' then ' (the user said this no longer troubles them)'
          when 'better' then ' (better than before)'
          when 'worse' then ' (worse than before)'
          when 'same' then ' (about the same as before)'
          when 'mixed' then ' (mixed)'
          else '' end
        || ': ' || v_state.text || E'\n';
    end if;
    for v_entry in
      select x.kind, x.text, x.person_name from (
        select distinct on (e.kind) e.kind, e.text, p.display_name as person_name
        from public.difficulty_entries e left join public.people_persons p on p.id = e.person_id
        where e.difficulty_id = v_difficulty.id and e.kind in ('how', 'coping')
        order by e.kind, private.difficulty_entry_conversation_at(e.id) desc nulls last, e.created_at desc, e.id desc
      ) x
      order by case x.kind when 'how' then 0 else 1 end
    loop
      v_block := v_block || '  ' || case v_entry.kind
          when 'how' then 'how it shows up: ' else 'what the user already does about it: ' end
        || v_entry.text
        || case when v_entry.person_name is not null then ' [with ' || v_entry.person_name || ']' else '' end
        || E'\n';
    end loop;
    for v_strategy in
      select e.kind, e.text, p.display_name as person_name, o.text as outcome_text, o.effect as outcome_effect
      from public.difficulty_entries e
      left join public.people_persons p on p.id = e.person_id
      left join lateral (
        select x.text, x.effect from public.difficulty_entries x
        where x.parent_entry_id = e.id and x.kind = 'outcome'
        order by private.difficulty_entry_conversation_at(x.id) desc nulls last, x.created_at desc, x.id desc
        limit 1
      ) o on true
      where e.difficulty_id = v_difficulty.id and e.kind in ('suggested', 'agreed')
      order by private.difficulty_entry_conversation_at(e.id) desc nulls last, e.created_at desc, e.id desc
      limit v_brief_max_strategies
    loop
      v_block := v_block || '  ' || case v_strategy.kind
          when 'suggested' then 'proposal from a conversation: ' else 'something the user decided to try: ' end
        || v_strategy.text
        || case when v_strategy.person_name is not null then ' [with ' || v_strategy.person_name || ']' else '' end;
      if v_strategy.outcome_text is not null then
        v_block := v_block || ' -> how it went' || private.describe_difficulty_outcome(v_strategy.outcome_effect)
          || ': ' || v_strategy.outcome_text;
      elsif v_strategy.kind = 'agreed' then
        v_block := v_block || ' -> no word yet on how it went';
      end if;
      v_block := v_block || E'\n';
    end loop;
    for v_entry in
      select e.text, e.effect from public.difficulty_entries e
      where e.difficulty_id = v_difficulty.id and e.kind = 'outcome' and e.parent_entry_id is null
      order by private.difficulty_entry_conversation_at(e.id) desc nulls last, e.created_at desc, e.id desc
      limit v_brief_max_orphan_outcomes
    loop
      v_block := v_block || '  how something the user tried went' || private.describe_difficulty_outcome(v_entry.effect)
        || ': ' || v_entry.text || E'\n';
    end loop;
    exit when length(v_brief) + length(v_block) > v_brief_max_chars;
    v_brief := v_brief || v_block;
    v_count := v_count + 1;
  end loop;
  return nullif(btrim(v_brief), '');
end $$;

-- Rezultat słowami, na których opierają się reguły promptu odpowiedzi.
create function private.describe_difficulty_outcome(p_effect text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case p_effect
    when 'better' then ' (it helped)'
    when 'worse' then ' (it made things worse)'
    when 'same' then ' (it changed nothing)'
    when 'mixed' then ' (mixed)'
    when 'resolved' then ' (it resolved the difficulty)'
    else '' end;
$$;

-- 3. Odświeżenie kopii przypiętych do rozmów właściciela w tej perspektywie
-- (wzór refresh_people_briefs; złączenie z sesją pomija kopie usuwane w tej
-- samej transakcji przy kaskadzie konta).
create function private.refresh_topic_briefs(p_user_id uuid, p_avatar_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.avatar_session_contexts c
    set topic_brief_text = private.render_topic_brief(c.avatar_id, s.about_difficulty_id)
  from public.therapy_sessions s
  where s.id = c.session_id and c.user_id = p_user_id and c.avatar_id = p_avatar_id and s.user_id = p_user_id;
end $$;

-- 4. Korekty użytkownika odświeżają przypięte briefy (te same podpisy).
create or replace function public.update_difficulty_card(
  p_difficulty_id uuid, p_label text, p_user_note text, p_archived boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_difficulty public.difficulties;
  v_label text := btrim(coalesce(p_label, ''));
  v_note text := btrim(coalesce(p_user_note, ''));
  v_taken_by uuid;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if length(v_label) = 0 or length(v_label) > 60 or length(v_note) > 600 or p_archived is null then
    raise exception 'invalid_difficulty_card' using errcode = '22023';
  end if;
  select * into v_difficulty from public.difficulties where id = p_difficulty_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  if v_label is distinct from v_difficulty.label then
    v_taken_by := private.resolve_difficulty_by_label(v_difficulty.avatar_id, private.normalize_difficulty_label(v_label));
    if v_taken_by is not null and v_taken_by <> v_difficulty.id then
      raise exception 'difficulty_label_taken' using errcode = 'P0014';
    end if;
    delete from public.difficulty_aliases where difficulty_id = v_difficulty.id
      and alias_normalized = private.normalize_difficulty_label(v_label);
  end if;
  update public.difficulties set
    label = v_label,
    label_locked = v_difficulty.label_locked or v_label is distinct from v_difficulty.label,
    user_note = v_note,
    archived_at = case when p_archived then coalesce(v_difficulty.archived_at, now()) else null end
    where id = v_difficulty.id;
  if v_label is distinct from v_difficulty.label then
    insert into public.difficulty_aliases(difficulty_id, user_id, avatar_id, alias)
      values (v_difficulty.id, auth.uid(), v_difficulty.avatar_id, v_difficulty.label)
      on conflict (user_id, avatar_id, alias_normalized) do nothing;
  end if;
  perform private.refresh_topic_briefs(auth.uid(), v_difficulty.avatar_id);
  return private.build_difficulty_card(v_difficulty.id);
end $$;

create or replace function public.delete_difficulty(p_difficulty_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_difficulty public.difficulties;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into v_difficulty from public.difficulties where id = p_difficulty_id and user_id = auth.uid();
  if not found then return false; end if;
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_difficulty.avatar_id for update;
  delete from public.difficulties where id = v_difficulty.id;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_difficulty.avatar_id;
  perform private.refresh_topic_briefs(auth.uid(), v_difficulty.avatar_id);
  return true;
end $$;

create or replace function public.decide_difficulty_person(p_difficulty_id uuid, p_person_id uuid, p_state text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_difficulty public.difficulties;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_state not in ('confirmed', 'rejected') then
    raise exception 'invalid_difficulty_person_state' using errcode = '22023';
  end if;
  select * into v_difficulty from public.difficulties where id = p_difficulty_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  if not exists (select 1 from public.people_persons p
    where p.id = p_person_id and p.user_id = auth.uid() and p.avatar_id = v_difficulty.avatar_id) then return null; end if;
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_difficulty.avatar_id for update;
  insert into public.difficulty_persons(difficulty_id, person_id, user_id, state, user_decided)
    values (v_difficulty.id, p_person_id, auth.uid(), p_state, true)
    on conflict (difficulty_id, person_id) do update set state = excluded.state, user_decided = true;
  if p_state = 'rejected' then
    delete from public.difficulty_entries where difficulty_id = v_difficulty.id and person_id = p_person_id;
  end if;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_difficulty.avatar_id;
  perform private.refresh_topic_briefs(auth.uid(), v_difficulty.avatar_id);
  return private.build_difficulty_card(v_difficulty.id);
end $$;

create or replace function public.update_difficulty_entry(p_entry_id uuid, p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_entry public.difficulty_entries;
  v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if length(v_text) = 0 or length(v_text) > 200 then
    raise exception 'invalid_difficulty_entry' using errcode = '22023';
  end if;
  select * into v_entry from public.difficulty_entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  update public.difficulty_entries set text = v_text, user_edited = true where id = v_entry.id;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_entry.avatar_id;
  perform private.refresh_topic_briefs(auth.uid(), v_entry.avatar_id);
  return private.build_difficulty_card(v_entry.difficulty_id);
end $$;

create or replace function public.delete_difficulty_entry(p_entry_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_entry public.difficulty_entries;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into v_entry from public.difficulty_entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_entry.avatar_id for update;
  delete from public.difficulty_entries where id = v_entry.id;
  perform private.prune_empty_difficulties(auth.uid(), v_entry.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_entry.avatar_id;
  perform private.refresh_topic_briefs(auth.uid(), v_entry.avatar_id);
  return jsonb_build_object('difficultyId', v_entry.difficulty_id, 'card', private.build_difficulty_card(v_entry.difficulty_id));
end $$;

create or replace function public.merge_difficulties(p_source_id uuid, p_target_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.difficulties;
  v_target public.difficulties;
  v_first uuid := least(p_source_id, p_target_id);
  v_second uuid := greatest(p_source_id, p_target_id);
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_source_id is null or p_target_id is null or p_source_id = p_target_id then
    raise exception 'invalid_difficulty_merge' using errcode = '22023';
  end if;
  perform 1 from public.difficulties where id = v_first and user_id = auth.uid() for update;
  perform 1 from public.difficulties where id = v_second and user_id = auth.uid() for update;
  select * into v_source from public.difficulties where id = p_source_id and user_id = auth.uid();
  if not found then return null; end if;
  select * into v_target from public.difficulties where id = p_target_id and user_id = auth.uid();
  if not found then return null; end if;
  if v_source.avatar_id <> v_target.avatar_id then
    raise exception 'invalid_difficulty_merge' using errcode = '22023';
  end if;
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_target.avatar_id for update;
  insert into public.difficulty_persons(difficulty_id, person_id, user_id, state, user_decided, created_at)
    select v_target.id, sp.person_id, sp.user_id, sp.state, sp.user_decided, sp.created_at
    from public.difficulty_persons sp
    where sp.difficulty_id = v_source.id
    on conflict (difficulty_id, person_id) do update set
      state = case
        when excluded.user_decided and not public.difficulty_persons.user_decided then excluded.state
        when public.difficulty_persons.user_decided then public.difficulty_persons.state
        when public.difficulty_persons.state = 'confirmed' or excluded.state = 'confirmed' then 'confirmed'
        else public.difficulty_persons.state end,
      user_decided = public.difficulty_persons.user_decided or excluded.user_decided;
  delete from public.difficulty_entries e
    using public.difficulty_persons tp
    where e.difficulty_id = v_source.id and e.person_id = tp.person_id
      and tp.difficulty_id = v_target.id and tp.state = 'rejected';
  update public.difficulty_entries set difficulty_id = v_target.id where difficulty_id = v_source.id;
  update public.difficulty_aliases set difficulty_id = v_target.id where difficulty_id = v_source.id;
  insert into public.difficulty_mentions(difficulty_id, session_id, user_id, mentioned_at)
    select v_target.id, m.session_id, m.user_id, m.mentioned_at
    from public.difficulty_mentions m where m.difficulty_id = v_source.id
    on conflict do nothing;
  update public.difficulties set user_note = left(
      case when length(v_target.user_note) = 0 then v_source.user_note
           when length(v_source.user_note) = 0 then v_target.user_note
           else v_target.user_note || E'\n' || v_source.user_note end, 600)
    where id = v_target.id;
  update public.therapy_sessions set about_difficulty_id = v_target.id
    where user_id = auth.uid() and about_difficulty_id = v_source.id;
  delete from public.difficulties where id = v_source.id;
  if not exists (select 1 from public.difficulties d where d.user_id = auth.uid() and d.avatar_id = v_target.avatar_id
    and d.label_normalized = v_source.label_normalized) then
    insert into public.difficulty_aliases(difficulty_id, user_id, avatar_id, alias)
      values (v_target.id, auth.uid(), v_target.avatar_id, v_source.label)
      on conflict (user_id, avatar_id, alias_normalized) do nothing;
  end if;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_target.avatar_id;
  perform private.refresh_topic_briefs(auth.uid(), v_target.avatar_id);
  return private.build_difficulty_card(v_target.id);
end $$;

-- 5. Wyłączenie mapy odłącza briefy od trwających rozmów (ponowne włączenie
-- ich nie odtwarza — jak przy kartach osób; następna korekta lub nowa rozmowa
-- renderuje je na nowo). Usunięcie mapy tak samo.
create or replace function public.set_topic_map_enabled(p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_avatar text;
  v_cursors jsonb;
  v_messages jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_enabled is null then raise exception 'invalid_topic_map_preference' using errcode = '22023'; end if;
  insert into public.user_preferences(user_id, topic_map_enabled) values (auth.uid(), p_enabled)
    on conflict (user_id) do update set topic_map_enabled = excluded.topic_map_enabled;
  if not p_enabled then
    update public.avatar_session_contexts set topic_brief_text = null where user_id = auth.uid();
    return true;
  end if;
  for v_avatar in
    select distinct s.avatar_id from public.therapy_sessions s
    where s.user_id = auth.uid() and s.avatar_id is not null and s.deleted_at is null
  loop
    insert into public.people_memories(user_id, avatar_id) values (auth.uid(), v_avatar) on conflict do nothing;
    perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_avatar for update;
    loop
      select coalesce(jsonb_agg(jsonb_build_object('sessionId', session_id, 'sequenceIndex', sequence_index,
        'characterOffset', character_offset)), '[]'::jsonb) into v_cursors
        from public.people_memory_sources where user_id = auth.uid() and avatar_id = v_avatar;
      v_messages := private.collect_unprocessed_messages(v_avatar, v_cursors, 24000, 128);
      exit when jsonb_array_length(v_messages) = 0;
      insert into public.people_memory_sources(user_id, avatar_id, session_id, sequence_index, character_offset)
        select distinct on (m."sessionId") auth.uid(), v_avatar, m."sessionId", m."sequenceIndex", m."characterOffset"
        from jsonb_to_recordset(v_messages)
          as m("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer)
        order by m."sessionId", m."sequenceIndex" desc, m."characterOffset" desc
        on conflict (user_id, avatar_id, session_id) do update
          set sequence_index = excluded.sequence_index, character_offset = excluded.character_offset;
    end loop;
    update public.people_memories set revision = gen_random_uuid(), updated_at = now()
      where user_id = auth.uid() and avatar_id = v_avatar;
  end loop;
  return true;
end $$;

create or replace function public.disable_and_delete_topic_map()
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.user_preferences(user_id, topic_map_enabled) values (auth.uid(), false)
    on conflict (user_id) do update set topic_map_enabled = false;
  update public.avatar_session_contexts set topic_brief_text = null where user_id = auth.uid();
  delete from public.difficulties where user_id = auth.uid();
  update public.people_memories set revision = gen_random_uuid(), updated_at = now() where user_id = auth.uid();
  return true;
end $$;

-- 6. Usunięcie kart osób zabiera powiązania i wpisy przy osobach, więc briefy
-- trudności są renderowane na nowo dla każdej perspektywy z przypiętą kopią.
create or replace function public.disable_and_delete_people_memory()
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_avatar text;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.user_preferences(user_id, people_memory_enabled) values (auth.uid(), false)
    on conflict (user_id) do update set people_memory_enabled = false;
  update public.avatar_session_contexts set people_brief_text = null where user_id = auth.uid();
  delete from public.people_persons where user_id = auth.uid();
  delete from public.people_exclusions where user_id = auth.uid();
  for v_avatar in select distinct d.avatar_id from public.difficulties d where d.user_id = auth.uid() loop
    perform private.prune_empty_difficulties(auth.uid(), v_avatar);
  end loop;
  delete from public.people_memories pm where pm.user_id = auth.uid()
    and not exists (select 1 from public.difficulties d where d.user_id = pm.user_id and d.avatar_id = pm.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now() where user_id = auth.uid();
  for v_avatar in select distinct c.avatar_id from public.avatar_session_contexts c where c.user_id = auth.uid() loop
    perform private.refresh_topic_briefs(auth.uid(), v_avatar);
  end loop;
  return true;
end $$;

-- 7. Zapomnienie osoby i usunięcie rozmowy odświeżają oba briefy.
create or replace function public.forget_person(p_person_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_person public.people_persons;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into v_person from public.people_persons where id = p_person_id and user_id = auth.uid();
  if not found then return false; end if;
  insert into public.avatar_memories(user_id, avatar_id) values (auth.uid(), v_person.avatar_id) on conflict do nothing;
  update public.avatar_memories set summary_text = '', revision = gen_random_uuid()
    where user_id = auth.uid() and avatar_id = v_person.avatar_id;
  delete from public.avatar_memory_sources where user_id = auth.uid() and avatar_id = v_person.avatar_id;
  update public.avatar_session_contexts c set summary_text = ''
    where c.user_id = auth.uid() and c.avatar_id = v_person.avatar_id
      and exists (select 1 from public.therapy_sessions s where s.id = c.session_id);
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_person.avatar_id for update;
  insert into public.people_exclusions(user_id, avatar_id, name_normalized, relation_normalized)
    values (auth.uid(), v_person.avatar_id, private.normalize_person_name(v_person.display_name),
      case when v_person.relation is null then null else private.normalize_person_name(v_person.relation) end);
  delete from public.people_persons where id = v_person.id;
  perform private.prune_empty_difficulties(auth.uid(), v_person.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_person.avatar_id;
  perform private.refresh_people_briefs(auth.uid(), v_person.avatar_id);
  perform private.refresh_topic_briefs(auth.uid(), v_person.avatar_id);
  return true;
end $$;

create or replace function public.purge_tombstoned_people_memory()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_user = 'supabase_auth_admin' then return null; end if;
  if old.avatar_id is null then return null; end if;
  perform 1 from public.avatar_memories where user_id = old.user_id and avatar_id = old.avatar_id for update;
  perform 1 from public.people_memories where user_id = old.user_id and avatar_id = old.avatar_id for update;
  if not found then return null; end if;
  delete from public.people_facts f
    where f.user_id = old.user_id
      and exists (select 1 from public.people_fact_sources s where s.fact_id = f.id and s.session_id = old.id);
  delete from public.people_person_mentions where user_id = old.user_id and session_id = old.id;
  update public.people_persons set relation = null, relation_source_session_id = null
    where user_id = old.user_id and relation_source_session_id = old.id and not relation_locked;
  update public.people_persons set relation_source_session_id = null
    where user_id = old.user_id and relation_source_session_id = old.id;
  delete from public.difficulty_entries e
    where e.user_id = old.user_id
      and exists (select 1 from public.difficulty_entry_sources s where s.entry_id = e.id and s.session_id = old.id);
  delete from public.difficulty_mentions where user_id = old.user_id and session_id = old.id;
  update public.difficulty_aliases set source_session_id = null
    where user_id = old.user_id and source_session_id = old.id;
  delete from public.people_memory_sources
    where user_id = old.user_id and avatar_id = old.avatar_id and session_id = old.id;
  perform private.prune_empty_people(old.user_id, old.avatar_id);
  perform private.prune_empty_difficulties(old.user_id, old.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = old.user_id and avatar_id = old.avatar_id;
  if tg_op = 'UPDATE' then
    perform private.refresh_people_briefs(old.user_id, old.avatar_id);
    perform private.refresh_topic_briefs(old.user_id, old.avatar_id);
  end if;
  return null;
end $$;

-- 8. Przypięcie przy starcie: brief trudności obok briefu osób, trudność
-- wybrana na dziś pierwsza. Walidacje P0012/P0013 i kompletność pamięci bez zmian.
create or replace function public.attach_avatar_session_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_work jsonb;
  v_brief text;
  v_topic_brief text;
begin
  if new.about_person_id is not null and not exists (select 1 from public.people_persons p
    where p.id = new.about_person_id and p.user_id = new.user_id and p.avatar_id is not distinct from new.avatar_id) then
    raise exception 'invalid_about_person' using errcode = 'P0012';
  end if;
  if new.about_difficulty_id is not null and not exists (select 1 from public.difficulties d
    where d.id = new.about_difficulty_id and d.user_id = new.user_id and d.avatar_id is not distinct from new.avatar_id) then
    raise exception 'invalid_about_difficulty' using errcode = 'P0013';
  end if;
  if not new.uses_avatar_memory then return new; end if;
  if not new.uses_approved_context or new.avatar_id is null then raise exception 'invalid_avatar_memory_start' using errcode = 'P0011'; end if;
  insert into public.avatar_memories(user_id, avatar_id) values (new.user_id, new.avatar_id) on conflict do nothing;
  perform 1 from public.avatar_memories where user_id = new.user_id and avatar_id = new.avatar_id for update;
  v_work := public.get_avatar_memory_work(new.avatar_id);
  if v_work->>'sessionId' is not null then raise exception 'avatar_memory_not_ready' using errcode = 'P0011'; end if;
  perform 1 from public.people_memories where user_id = new.user_id and avatar_id = new.avatar_id for update;
  v_brief := private.render_people_brief(new.avatar_id, new.about_person_id);
  v_topic_brief := private.render_topic_brief(new.avatar_id, new.about_difficulty_id);
  insert into public.avatar_session_contexts(session_id, user_id, avatar_id, summary_text, people_brief_text, topic_brief_text)
    values (new.id, new.user_id, new.avatar_id, v_work->>'summaryText', v_brief, v_topic_brief);
  return new;
end $$;

-- 9. Uprawnienia funkcji (revoke-first).
revoke all on function
  private.render_topic_brief(text, uuid), private.describe_difficulty_outcome(text),
  private.refresh_topic_briefs(uuid, text)
  from public, anon;
grant execute on function
  private.render_topic_brief(text, uuid), private.describe_difficulty_outcome(text),
  private.refresh_topic_briefs(uuid, text)
  to authenticated;
