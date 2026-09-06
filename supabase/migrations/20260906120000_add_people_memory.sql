-- Karty osób („Osoby z Twoich rozmów”): prywatne notatki o ludziach, o których
-- użytkownik wspomina w rozmowach. Zakres per użytkownik + awatar, jak
-- avatar_memories. Tożsamość osoby to UUID — dwie Marty są legalne, imię i
-- relacja są tylko atrybutami. Fakty są małe i niezależne; każdy nosi zbiór
-- rozmów źródłowych, więc usunięcie rozmowy usuwa dokładnie to, co z niej
-- pochodzi. Migracja jest addytywna: stary Worker nie zna nowych kolumn ani
-- funkcji, a get_avatar_memory_batch zachowuje sygnaturę i kształt wyniku.
--
-- Kolejność blokad (wspólna dla wszystkich nowych funkcji):
--   therapy_sessions (rosnąco po UUID) → avatar_memories → people_memories → avatar_session_contexts

-- 1. Preferencja: zapamiętywanie osób. `locale` przestaje być wymagane, żeby
-- zapis samego przełącznika nie utrwalał domyślnego języka (odczyt już
-- toleruje wartość spoza listy języków).
alter table public.user_preferences add column people_memory_enabled boolean not null default true;
alter table public.user_preferences alter column locale drop not null;
grant insert (people_memory_enabled) on table public.user_preferences to authenticated;
grant update (people_memory_enabled) on table public.user_preferences to authenticated;

-- 2. Pomocnicze funkcje poza Data API. Wszystkie działają jako wywołujący
-- (owner pod RLS); schemat `private` tylko chowa je przed PostgREST.
create function private.normalize_person_name(p_name text)
returns text language sql immutable security invoker set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$$;

create function private.people_memory_enabled()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((select people_memory_enabled from public.user_preferences where user_id = auth.uid()), true);
$$;

-- 3. Tabele
create table public.people_memories (
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null check (avatar_id in (
    'psychodynamic-listener', 'cbt-guide', 'experiential-companion', 'systemic-connector', 'integrative-guide'
  )),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key (user_id, avatar_id)
);

create table public.people_memory_sources (
  user_id uuid not null,
  avatar_id text not null,
  session_id uuid not null,
  sequence_index integer not null check (sequence_index >= 0),
  character_offset integer not null check (character_offset >= 0),
  primary key (user_id, avatar_id, session_id),
  foreign key (user_id, avatar_id) references public.people_memories(user_id, avatar_id) on delete cascade,
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);

-- Bez indeksu unikalnego na imieniu: „Marta z pracy” i „Marta, kuzynka” to
-- dwie osoby. Pola *_locked oznaczają wartości ustalone ręcznie przez
-- użytkownika — model ich nie zmienia.
create table public.people_persons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  display_name text not null check (length(btrim(display_name)) > 0 and length(display_name) <= 60),
  name_locked boolean not null default false,
  relation text check (relation is null or (length(btrim(relation)) > 0 and length(relation) <= 80)),
  relation_locked boolean not null default false,
  relation_source_session_id uuid references public.therapy_sessions(id) on delete set null,
  user_note text not null default '' check (length(user_note) <= 600),
  -- clock_timestamp(), nie now(): jedna partia wstawia wiele osób i wpisów w
  -- jednej transakcji, a ich kolejność (najnowszy wpis rodzaju w briefie)
  -- musi być deterministyczna zamiast losowej po UUID.
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, avatar_id) references public.people_memories(user_id, avatar_id) on delete cascade
);
create index people_persons_owner_idx on public.people_persons(user_id, avatar_id);

create table public.people_facts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people_persons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  kind text not null constraint people_facts_kind_check check (kind in ('who', 'account', 'feeling', 'wish')),
  text text not null constraint people_facts_text_check check (length(btrim(text)) > 0 and length(text) <= 200),
  user_edited boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
create index people_facts_person_idx on public.people_facts(person_id);

-- Zbiór źródeł faktu. Fakt zastąpiony dziedziczy źródła starego plus nową
-- rozmowę; usunięcie dowolnej z nich usuwa cały fakt.
create table public.people_fact_sources (
  fact_id uuid not null references public.people_facts(id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  primary key (fact_id, session_id),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);
create index people_fact_sources_session_idx on public.people_fact_sources(session_id);

-- Wzmianki: jedna rozmowa to jedna wzmianka, niezależnie od liczby partii.
create table public.people_person_mentions (
  person_id uuid not null references public.people_persons(id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  mentioned_at timestamptz not null,
  primary key (person_id, session_id),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);
create index people_person_mentions_session_idx on public.people_person_mentions(session_id);

-- Wykluczenia („zapomnij o tej osobie”) z kontekstem relacji: zapomnienie
-- Marty z pracy nie blokuje kuzynki o tym samym imieniu.
create table public.people_exclusions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  name_normalized text not null check (length(name_normalized) between 1 and 60),
  relation_normalized text check (relation_normalized is null or length(relation_normalized) <= 80),
  created_at timestamptz not null default now(),
  foreign key (user_id, avatar_id) references public.people_memories(user_id, avatar_id) on delete cascade
);
create index people_exclusions_lookup_idx on public.people_exclusions(user_id, avatar_id, name_normalized);

alter table public.people_memories enable row level security;
alter table public.people_memory_sources enable row level security;
alter table public.people_persons enable row level security;
alter table public.people_facts enable row level security;
alter table public.people_fact_sources enable row level security;
alter table public.people_person_mentions enable row level security;
alter table public.people_exclusions enable row level security;

-- Granty: najpierw revoke (domyślne uprawnienia Supabase dają ALL każdej nowej
-- tabeli), potem pełny CRUD właściciela pod politykami RLS.
revoke all privileges on table public.people_memories, public.people_memory_sources, public.people_persons,
  public.people_facts, public.people_fact_sources, public.people_person_mentions, public.people_exclusions
  from anon, authenticated;
grant select, insert, update, delete on table public.people_memories, public.people_memory_sources,
  public.people_persons, public.people_facts, public.people_fact_sources, public.people_person_mentions,
  public.people_exclusions to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'people_memories', 'people_memory_sources', 'people_persons', 'people_facts',
    'people_fact_sources', 'people_person_mentions', 'people_exclusions'
  ] loop
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- 4. Przypięty brief i osoba wybrana na start rozmowy.
alter table public.avatar_session_contexts add column people_brief_text text
  check (people_brief_text is null or length(people_brief_text) <= 6000);
alter table public.therapy_sessions add column about_person_id uuid
  references public.people_persons(id) on delete set null;
grant insert (about_person_id) on public.therapy_sessions to authenticated;

-- 5. Wspólny kolektor nieprzetworzonych wiadomości (ciało dawnego
-- get_avatar_memory_batch); kursory przychodzą z tabeli wywołującego.
create function private.collect_unprocessed_messages(
  p_avatar_id text, p_cursors jsonb, p_max_chars integer, p_max_messages integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_message record;
  v_messages jsonb := '[]'::jsonb;
  v_used_chars integer := 0;
  v_take integer;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  for v_message in
    select s.id as session_id, m.role, m.sequence_index,
      case when m.sequence_index = c."sequenceIndex" then c."characterOffset" else 0 end as start_offset,
      substring(m.content from
        (case when m.sequence_index = c."sequenceIndex" then c."characterOffset" else 0 end) + 1
        for p_max_chars) as content
    from public.therapy_sessions s
    left join jsonb_to_recordset(coalesce(p_cursors, '[]'::jsonb))
      as c("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer) on c."sessionId" = s.id
    join public.session_messages m on m.session_id = s.id and m.user_id = s.user_id
    where s.user_id = auth.uid() and s.avatar_id = p_avatar_id and s.deleted_at is null
      and (s.status in ('completed', 'expired', 'interrupted') or (s.status = 'active' and s.expires_at <= now()))
      and exists (select 1 from public.session_messages u
        where u.session_id = s.id and u.user_id = s.user_id and u.role = 'user')
      and m.role in ('user', 'assistant') and length(m.content) > 0
      and (m.sequence_index > coalesce(c."sequenceIndex", -1)
        or (m.sequence_index = c."sequenceIndex" and length(m.content) > c."characterOffset"))
    order by s.created_at, s.id, m.sequence_index
    limit p_max_messages
  loop
    v_take := least(length(v_message.content), p_max_chars - v_used_chars);
    v_messages := v_messages || jsonb_build_array(jsonb_build_object(
      'sessionId', v_message.session_id, 'role', v_message.role,
      'sequenceIndex', v_message.sequence_index,
      'characterOffset', v_message.start_offset + v_take,
      'content', substring(v_message.content from 1 for v_take)
    ));
    v_used_chars := v_used_chars + v_take;
    exit when v_used_chars = p_max_chars;
  end loop;
  return v_messages;
end $$;

create function private.list_forgotten_people(p_avatar_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name_normalized, 'relation', relation_normalized)
    order by created_at, id), '[]'::jsonb)
  from public.people_exclusions where user_id = auth.uid() and avatar_id = p_avatar_id;
$$;

-- Ta sama sygnatura i te same pola co dotąd; `forgottenPeople` jest dodatkowe
-- (stary Worker je ignoruje), żeby odbudowa pamięci pomijała zapomniane osoby.
create or replace function public.get_avatar_memory_batch(p_avatar_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_max_chars constant integer := 48000;
  v_max_messages constant integer := 128;
  v_memory public.avatar_memories;
  v_cursors jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.avatar_memories(user_id, avatar_id) values (auth.uid(), p_avatar_id)
    on conflict do nothing;
  select * into strict v_memory from public.avatar_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id;
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', session_id, 'sequenceIndex', sequence_index,
    'characterOffset', character_offset)), '[]'::jsonb) into v_cursors
    from public.avatar_memory_sources where user_id = auth.uid() and avatar_id = p_avatar_id;
  return jsonb_build_object('revision', v_memory.revision, 'summaryText', v_memory.summary_text,
    'messages', private.collect_unprocessed_messages(p_avatar_id, v_cursors, v_max_chars, v_max_messages),
    'forgottenPeople', private.list_forgotten_people(p_avatar_id));
end $$;

-- 6. Karty osób: partia do ekstrakcji, indeks istniejących osób bez UUID
-- w prompcie (aplikacja mapuje refy), własne kursory i własna rewizja.
create function public.get_people_memory_batch(p_avatar_id text, p_max_chars integer default 16000)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_batch_min_chars constant integer := 2000;
  v_batch_max_chars constant integer := 24000;
  v_max_messages constant integer := 128;
  v_memory public.people_memories;
  v_cursors jsonb;
  v_persons jsonb;
  v_max_chars integer;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.people_memories(user_id, avatar_id) values (auth.uid(), p_avatar_id)
    on conflict do nothing;
  select * into strict v_memory from public.people_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id;
  if not private.people_memory_enabled() then
    return jsonb_build_object('revision', v_memory.revision, 'enabled', false, 'persons', '[]'::jsonb,
      'forgottenPeople', '[]'::jsonb, 'messages', '[]'::jsonb);
  end if;
  v_max_chars := least(greatest(coalesce(p_max_chars, 16000), v_batch_min_chars), v_batch_max_chars);
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', session_id, 'sequenceIndex', sequence_index,
    'characterOffset', character_offset)), '[]'::jsonb) into v_cursors
    from public.people_memory_sources where user_id = auth.uid() and avatar_id = p_avatar_id;
  select coalesce(jsonb_agg(x.person order by x.last_mentioned desc nulls last, x.created_at, x.id), '[]'::jsonb)
    into v_persons
  from (
    select p.id, p.created_at,
      (select max(m.mentioned_at) from public.people_person_mentions m where m.person_id = p.id) as last_mentioned,
      jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'nameLocked', p.name_locked,
        'relation', p.relation, 'relationLocked', p.relation_locked, 'userNote', p.user_note,
        'facts', coalesce((
          select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'text', f.text, 'userEdited', f.user_edited)
            order by f.created_at, f.id)
          from public.people_facts f where f.person_id = p.id), '[]'::jsonb)
      ) as person
    from public.people_persons p
    where p.user_id = auth.uid() and p.avatar_id = p_avatar_id
  ) x;
  return jsonb_build_object('revision', v_memory.revision, 'enabled', true, 'persons', v_persons,
    'forgottenPeople', private.list_forgotten_people(p_avatar_id),
    'messages', private.collect_unprocessed_messages(p_avatar_id, v_cursors, v_max_chars, v_max_messages));
end $$;

create function private.prune_empty_people(p_user_id uuid, p_avatar_id text)
returns void language sql security invoker set search_path = '' as $$
  delete from public.people_persons p
  where p.user_id = p_user_id and p.avatar_id = p_avatar_id
    and length(p.user_note) = 0 and not p.name_locked and not p.relation_locked
    and not exists (select 1 from public.people_facts f where f.person_id = p.id);
$$;

-- Brief do promptu: osoba wybrana na dziś zawsze pierwsza, potem najświeższe
-- wzmianki; na osobę najnowszy fakt każdego rodzaju. Zatrzymuje się przed
-- przekroczeniem limitu znaków. NULL = wyłączone albo brak osób.
create function private.render_people_brief(p_avatar_id text, p_about_person_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_brief_max_chars constant integer := 6000;
  v_brief_max_persons constant integer := 10;
  v_brief_max_facts constant integer := 4;
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
      order by case x.kind when 'who' then 0 when 'wish' then 1 when 'account' then 2 else 3 end
      limit v_brief_max_facts
    loop
      v_block := v_block || '  ' || case v_fact.kind
        when 'who' then 'who they are to the user: '
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

-- Odświeża przypięte briefy awatara po usunięciu danych (usuwanie ma
-- pierwszeństwo przed niezmiennością kopii). Edycje treści nie odświeżają.
-- Złączenie z sesją pomija kopie, których sesja została już usunięta w tej
-- samej transakcji (kaskada konta) — ich aktualizacja naruszyłaby klucz obcy.
create function private.refresh_people_briefs(p_user_id uuid, p_avatar_id text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.avatar_session_contexts c
    set people_brief_text = private.render_people_brief(c.avatar_id, s.about_person_id)
  from public.therapy_sessions s
  where s.id = c.session_id and c.user_id = p_user_id and c.avatar_id = p_avatar_id and s.user_id = p_user_id;
end $$;

-- Ten sam trigger co dotąd, z jednym zabezpieczeniem: przy kaskadzie usuwania
-- konta wszystkie sesje znikają jednym poleceniem, zanim ruszą ich triggery.
-- Druga aktualizacja tej samej kopii w jednej transakcji wymusza sprawdzenie
-- klucza obcego do już usuniętej sesji, więc kopie bez sesji są pomijane.
create or replace function public.invalidate_deleted_avatar_memory()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_user = 'supabase_auth_admin' then return null; end if;
  if old.avatar_id is null then return null; end if;
  update public.avatar_memories set summary_text = '', revision = gen_random_uuid()
    where user_id = old.user_id and avatar_id = old.avatar_id;
  delete from public.avatar_memory_sources where user_id = old.user_id and avatar_id = old.avatar_id;
  update public.avatar_session_contexts c set summary_text = ''
    where c.user_id = old.user_id and c.avatar_id = old.avatar_id
      and exists (select 1 from public.therapy_sessions s where s.id = c.session_id);
  if tg_op = 'UPDATE' then
    delete from public.avatar_session_contexts where session_id = old.id and user_id = old.user_id;
  end if;
  return null;
end $$;

-- Zapis partii. `false` tylko przy wyścigach (rewizja, cofnięty kursor,
-- niedostępne źródło, wyłączona preferencja); 22023 przy naruszeniu kontraktu
-- aplikacji; semantyczne przekroczenia (limity, nieznane id, zapomniana osoba)
-- są pomijane, a kursory i tak się przesuwają — inaczej klient pollowałby bez końca.
create function public.save_people_memory_batch(
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
      if jsonb_typeof(v_fact->'factId') <> 'string' or coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish')
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
      if coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish')
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
      where coalesce(f->>'kind', '') in ('who', 'account', 'feeling', 'wish')
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
      if coalesce(v_fact->>'kind', '') not in ('who', 'account', 'feeling', 'wish')
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

-- 7. Karty do interfejsu: jeden kształt dla listy, edycji i odczytu po zmianie.
create function private.build_person_card(p_person_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'avatarId', p.avatar_id, 'name', p.display_name, 'nameLocked', p.name_locked,
    'relation', p.relation, 'relationLocked', p.relation_locked, 'userNote', p.user_note,
    'createdAt', p.created_at,
    'firstMentionedAt', (select min(m.mentioned_at) from public.people_person_mentions m where m.person_id = p.id),
    'lastMentionedAt', (select max(m.mentioned_at) from public.people_person_mentions m where m.person_id = p.id),
    'mentionCount', (select count(*) from public.people_person_mentions m where m.person_id = p.id),
    'facts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'text', f.text, 'userEdited', f.user_edited, 'createdAt', f.created_at,
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object('sessionId', fs.session_id, 'conversationAt', s.created_at)
            order by s.created_at, fs.session_id)
          from public.people_fact_sources fs join public.therapy_sessions s on s.id = fs.session_id
          where fs.fact_id = f.id), '[]'::jsonb)
      ) order by f.created_at, f.id)
      from public.people_facts f where f.person_id = p.id), '[]'::jsonb)
  )
  from public.people_persons p where p.id = p_person_id and p.user_id = auth.uid();
$$;

create function public.list_person_cards(p_avatar_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(private.build_person_card(x.id)
    order by x.last_mentioned desc nulls last, x.created_at desc, x.id), '[]'::jsonb)
  from (
    select p.id, p.created_at,
      (select max(m.mentioned_at) from public.people_person_mentions m where m.person_id = p.id) as last_mentioned
    from public.people_persons p where p.user_id = auth.uid() and p.avatar_id = p_avatar_id
  ) x;
$$;

create function public.get_person_card(p_person_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.build_person_card(p_person_id);
$$;

-- Edycja przez użytkownika: zmieniona wartość zostaje zablokowana przed modelem.
create function public.update_person_card(
  p_person_id uuid, p_display_name text, p_relation text, p_user_note text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_person public.people_persons;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_relation text := nullif(btrim(coalesce(p_relation, '')), '');
  v_note text := btrim(coalesce(p_user_note, ''));
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if length(v_name) = 0 or length(v_name) > 60 or length(v_note) > 600
    or (v_relation is not null and length(v_relation) > 80) then
    raise exception 'invalid_person_card' using errcode = '22023';
  end if;
  select * into v_person from public.people_persons where id = p_person_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  update public.people_persons set
    display_name = v_name,
    name_locked = v_person.name_locked or v_name is distinct from v_person.display_name,
    relation = v_relation,
    relation_locked = v_person.relation_locked or v_relation is distinct from v_person.relation,
    relation_source_session_id = case when v_relation is distinct from v_person.relation then null
      else v_person.relation_source_session_id end,
    user_note = v_note
    where id = v_person.id;
  return private.build_person_card(v_person.id);
end $$;

create function public.update_person_fact(p_fact_id uuid, p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_fact public.people_facts;
  v_text text := btrim(coalesce(p_text, ''));
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if length(v_text) = 0 or length(v_text) > 200 then
    raise exception 'invalid_person_fact' using errcode = '22023';
  end if;
  select * into v_fact from public.people_facts where id = p_fact_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  update public.people_facts set text = v_text, user_edited = true where id = v_fact.id;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_fact.avatar_id;
  return private.build_person_card(v_fact.person_id);
end $$;

-- NULL = brak takiego wpisu; `{"personId", "card"}` po usunięciu, przy czym
-- `card` jest NULL, gdy usunięty wpis był ostatnim i osoba zniknęła razem z nim.
create function public.delete_person_fact(p_fact_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_fact public.people_facts;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  select * into v_fact from public.people_facts where id = p_fact_id and user_id = auth.uid() for update;
  if not found then return null; end if;
  perform 1 from public.people_memories where user_id = auth.uid() and avatar_id = v_fact.avatar_id for update;
  delete from public.people_facts where id = v_fact.id;
  perform private.prune_empty_people(auth.uid(), v_fact.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_fact.avatar_id;
  perform private.refresh_people_briefs(auth.uid(), v_fact.avatar_id);
  return jsonb_build_object('personId', v_fact.person_id, 'card', private.build_person_card(v_fact.person_id));
end $$;

-- „Zapomnij o tej osobie”: karta znika, wykluczenie zostaje, a pamięć awatara
-- jest unieważniana tak jak po usunięciu rozmowy — następne przygotowanie
-- odbudowuje ją z listą zapomnianych osób w prompcie.
create function public.forget_person(p_person_id uuid)
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
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_person.avatar_id;
  perform private.refresh_people_briefs(auth.uid(), v_person.avatar_id);
  return true;
end $$;

-- Przełącznik. Wyłączenie odłącza karty od trwających rozmów; ponowne
-- włączenie przewija kursory — rozmowy z okresu wyłączenia nie są przetwarzane.
create function public.set_people_memory_enabled(p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_avatar text;
  v_cursors jsonb;
  v_messages jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_enabled is null then raise exception 'invalid_people_memory_preference' using errcode = '22023'; end if;
  insert into public.user_preferences(user_id, people_memory_enabled) values (auth.uid(), p_enabled)
    on conflict (user_id) do update set people_memory_enabled = excluded.people_memory_enabled;
  if not p_enabled then
    update public.avatar_session_contexts set people_brief_text = null where user_id = auth.uid();
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

-- „Wyłącz i usuń wszystkie karty”: bez unieważniania pamięci awatara.
create function public.disable_and_delete_people_memory()
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.user_preferences(user_id, people_memory_enabled) values (auth.uid(), false)
    on conflict (user_id) do update set people_memory_enabled = false;
  update public.avatar_session_contexts set people_brief_text = null where user_id = auth.uid();
  delete from public.people_memories where user_id = auth.uid();
  return true;
end $$;

-- 8. Edycja osoby przez tabelę: przypięte kolumny i bump rewizji, żeby
-- trwająca partia przegrała CAS zamiast nadpisać korektę użytkownika.
create function public.people_persons_before_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.user_id := old.user_id;
  new.avatar_id := old.avatar_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.display_name is distinct from old.display_name or new.relation is distinct from old.relation
    or new.user_note is distinct from old.user_note or new.name_locked is distinct from old.name_locked
    or new.relation_locked is distinct from old.relation_locked then
    update public.people_memories set revision = gen_random_uuid(), updated_at = now()
      where user_id = old.user_id and avatar_id = old.avatar_id;
  end if;
  return new;
end $$;
create trigger people_persons_touch_revision before update on public.people_persons
  for each row execute function public.people_persons_before_update();

-- 9. Przypięcie briefu przy starcie sesji (bez zmian w sprawdzeniu pamięci).
create or replace function public.attach_avatar_session_context()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_work jsonb;
  v_brief text;
begin
  if new.about_person_id is not null and not exists (select 1 from public.people_persons p
    where p.id = new.about_person_id and p.user_id = new.user_id and p.avatar_id is not distinct from new.avatar_id) then
    raise exception 'invalid_about_person' using errcode = 'P0012';
  end if;
  if not new.uses_avatar_memory then return new; end if;
  if not new.uses_approved_context or new.avatar_id is null then raise exception 'invalid_avatar_memory_start' using errcode = 'P0011'; end if;
  -- Blokada pamięci obejmuje sprawdzenie kompletności i skopiowanie kontekstu.
  insert into public.avatar_memories(user_id, avatar_id) values (new.user_id, new.avatar_id) on conflict do nothing;
  perform 1 from public.avatar_memories where user_id = new.user_id and avatar_id = new.avatar_id for update;
  v_work := public.get_avatar_memory_work(new.avatar_id);
  if v_work->>'sessionId' is not null then raise exception 'avatar_memory_not_ready' using errcode = 'P0011'; end if;
  perform 1 from public.people_memories where user_id = new.user_id and avatar_id = new.avatar_id for update;
  v_brief := private.render_people_brief(new.avatar_id, new.about_person_id);
  insert into public.avatar_session_contexts(session_id, user_id, avatar_id, summary_text, people_brief_text)
    values (new.id, new.user_id, new.avatar_id, v_work->>'summaryText', v_brief);
  return new;
end $$;

-- 10. Usunięcie rozmowy: znika wszystko, co z niej korzystało.
create function public.purge_tombstoned_people_memory()
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
  delete from public.people_memory_sources
    where user_id = old.user_id and avatar_id = old.avatar_id and session_id = old.id;
  perform private.prune_empty_people(old.user_id, old.avatar_id);
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = old.user_id and avatar_id = old.avatar_id;
  if tg_op = 'UPDATE' then
    perform private.refresh_people_briefs(old.user_id, old.avatar_id);
  end if;
  return null;
end $$;
create trigger therapy_sessions_purge_people_memory after update of status on public.therapy_sessions
  for each row when (new.status = 'deleted' and old.status <> 'deleted') execute function public.purge_tombstoned_people_memory();
create trigger therapy_sessions_delete_people_memory after delete on public.therapy_sessions
  for each row execute function public.purge_tombstoned_people_memory();

-- 11. Uprawnienia funkcji.
revoke all on function
  private.normalize_person_name(text), private.people_memory_enabled(),
  private.collect_unprocessed_messages(text, jsonb, integer, integer), private.list_forgotten_people(text),
  private.prune_empty_people(uuid, text), private.render_people_brief(text, uuid), private.refresh_people_briefs(uuid, text),
  private.build_person_card(uuid),
  public.get_avatar_memory_batch(text),
  public.get_people_memory_batch(text, integer), public.save_people_memory_batch(text, uuid, jsonb, jsonb),
  public.list_person_cards(text), public.get_person_card(uuid),
  public.update_person_card(uuid, text, text, text), public.update_person_fact(uuid, text), public.delete_person_fact(uuid),
  public.forget_person(uuid), public.set_people_memory_enabled(boolean), public.disable_and_delete_people_memory()
  from public, anon;
grant execute on function
  private.normalize_person_name(text), private.people_memory_enabled(),
  private.collect_unprocessed_messages(text, jsonb, integer, integer), private.list_forgotten_people(text),
  private.prune_empty_people(uuid, text), private.render_people_brief(text, uuid), private.refresh_people_briefs(uuid, text),
  private.build_person_card(uuid),
  public.get_avatar_memory_batch(text),
  public.get_people_memory_batch(text, integer), public.save_people_memory_batch(text, uuid, jsonb, jsonb),
  public.list_person_cards(text), public.get_person_card(uuid),
  public.update_person_card(uuid, text, text, text), public.update_person_fact(uuid, text), public.delete_person_fact(uuid),
  public.forget_person(uuid), public.set_people_memory_enabled(boolean), public.disable_and_delete_people_memory()
  to authenticated;
revoke all on function public.people_persons_before_update(), public.purge_tombstoned_people_memory(),
  public.attach_avatar_session_context() from public, anon, authenticated;
