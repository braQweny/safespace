-- Mapa tematów: trudności użytkownika, ich powiązania z osobami z kart osób
-- i sposoby radzenia sobie, które padły w rozmowach. Rozszerzenie potoku kart
-- osób: ta sama partia, te same kursory (people_memory_sources) i ta sama
-- rewizja (people_memories.revision). Trudność należy do użytkownika, nie do
-- osoby; osoba jest krawędzią (difficulty_persons). Wpisy są małe i
-- niezależne, każdy ze zbiorem rozmów źródłowych, jak people_facts.
--
-- Deduplikacja: etykieta znormalizowana jest unikalna w perspektywie, aliasy
-- (inne sformułowania) są unikalne w perspektywie, a nowa trudność pasująca
-- do etykiety lub aliasu jest składana do istniejącej. Migracja jest
-- addytywna: podpisy get_people_memory_batch i save_people_memory_batch bez
-- zmian, nowe klucze w wyniku i w zmianach stary Worker ignoruje.
--
-- Kolejność blokad (wspólna z kartami osób):
--   therapy_sessions (rosnąco po UUID) → avatar_memories → people_memories → avatar_session_contexts

-- 1. Preferencja: mapa tematów, osobna od kart osób.
alter table public.user_preferences add column topic_map_enabled boolean not null default true;
grant insert (topic_map_enabled) on table public.user_preferences to authenticated;
grant update (topic_map_enabled) on table public.user_preferences to authenticated;

create function private.topic_map_enabled()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((select topic_map_enabled from public.user_preferences where user_id = auth.uid()), true);
$$;

-- 2. Tabele.
create table public.difficulties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  label text not null constraint difficulties_label_check check (length(btrim(label)) > 0 and length(label) <= 60),
  -- Ustawiane w triggerze tą samą normalizacją co imiona osób; zwykła kolumna,
  -- nie generowana, żeby normalizacja mogła kiedyś przestać być IMMUTABLE.
  label_normalized text not null,
  label_locked boolean not null default false,
  user_note text not null default '' constraint difficulties_user_note_check check (length(user_note) <= 600),
  -- „Mniej aktualne”: ustawia tylko użytkownik, model nigdy.
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, avatar_id) references public.people_memories(user_id, avatar_id) on delete cascade
);
create unique index difficulties_label_unique_idx on public.difficulties(user_id, avatar_id, label_normalized);
create index difficulties_owner_idx on public.difficulties(user_id, avatar_id);

-- Inne sformułowania tej samej trudności. Unikalne w całej perspektywie, żeby
-- dopasowanie po aliasie było jednoznaczne; alias równy etykiecie dowolnej
-- trudności w perspektywie jest pomijany przy zapisie.
create table public.difficulty_aliases (
  id uuid primary key default gen_random_uuid(),
  difficulty_id uuid not null references public.difficulties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  alias text not null constraint difficulty_aliases_alias_check check (length(btrim(alias)) > 0 and length(alias) <= 60),
  alias_normalized text not null,
  source_session_id uuid references public.therapy_sessions(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index difficulty_aliases_unique_idx on public.difficulty_aliases(user_id, avatar_id, alias_normalized);
create index difficulty_aliases_difficulty_idx on public.difficulty_aliases(difficulty_id);

-- Krawędź grafu: „użytkownik opisywał tę trudność w tej relacji”. Model
-- tworzy confirmed albo suggested (niepewne, do potwierdzenia); wiersz z
-- user_decided jest poza zasięgiem modelu, a rejected blokuje ponowne dodanie.
create table public.difficulty_persons (
  difficulty_id uuid not null references public.difficulties(id) on delete cascade,
  person_id uuid not null references public.people_persons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null default 'confirmed' constraint difficulty_persons_state_check check (state in ('suggested', 'confirmed', 'rejected')),
  user_decided boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  primary key (difficulty_id, person_id)
);
create index difficulty_persons_person_idx on public.difficulty_persons(person_id);

-- Wpis: how (jak to wygląda), coping (co użytkownik sam robi), update (jak
-- jest teraz), suggested (propozycja awatara), agreed (postanowienie), outcome
-- (jak poszło). effect tylko dla update i outcome. Wpis z osobą wymaga
-- krawędzi (złożony FK); rodzic dziedziczony jest zerowany przy usunięciu,
-- żeby dziecko spadło do chronologii zamiast zniknąć.
create table public.difficulty_entries (
  id uuid primary key default gen_random_uuid(),
  difficulty_id uuid not null references public.difficulties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null,
  person_id uuid,
  kind text not null constraint difficulty_entries_kind_check check (kind in ('how', 'coping', 'update', 'suggested', 'agreed', 'outcome')),
  text text not null constraint difficulty_entries_text_check check (length(btrim(text)) > 0 and length(text) <= 200),
  effect text constraint difficulty_entries_effect_check check (effect is null or (kind in ('update', 'outcome') and effect in ('better', 'same', 'worse', 'resolved', 'mixed'))),
  parent_entry_id uuid references public.difficulty_entries(id) on delete set null,
  user_edited boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (difficulty_id, person_id) references public.difficulty_persons(difficulty_id, person_id) on delete cascade
);
create index difficulty_entries_difficulty_idx on public.difficulty_entries(difficulty_id);
create index difficulty_entries_parent_idx on public.difficulty_entries(parent_entry_id);

create table public.difficulty_entry_sources (
  entry_id uuid not null references public.difficulty_entries(id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  primary key (entry_id, session_id),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);
create index difficulty_entry_sources_session_idx on public.difficulty_entry_sources(session_id);

create table public.difficulty_mentions (
  difficulty_id uuid not null references public.difficulties(id) on delete cascade,
  session_id uuid not null,
  user_id uuid not null,
  mentioned_at timestamptz not null,
  primary key (difficulty_id, session_id),
  foreign key (session_id, user_id) references public.therapy_sessions(id, user_id) on delete cascade
);
create index difficulty_mentions_session_idx on public.difficulty_mentions(session_id);

alter table public.difficulties enable row level security;
alter table public.difficulty_aliases enable row level security;
alter table public.difficulty_persons enable row level security;
alter table public.difficulty_entries enable row level security;
alter table public.difficulty_entry_sources enable row level security;
alter table public.difficulty_mentions enable row level security;

revoke all privileges on table public.difficulties, public.difficulty_aliases, public.difficulty_persons,
  public.difficulty_entries, public.difficulty_entry_sources, public.difficulty_mentions
  from anon, authenticated;
grant select, insert, update, delete on table public.difficulties, public.difficulty_aliases,
  public.difficulty_persons, public.difficulty_entries, public.difficulty_entry_sources, public.difficulty_mentions
  to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'difficulties', 'difficulty_aliases', 'difficulty_persons', 'difficulty_entries',
    'difficulty_entry_sources', 'difficulty_mentions'
  ] loop
    execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- Trudność wybrana przez „Porozmawiaj o tym”; walidacja właściciela i
-- perspektywy w attach_avatar_session_context (P0013).
alter table public.therapy_sessions add column about_difficulty_id uuid
  references public.difficulties(id) on delete set null;
grant insert (about_difficulty_id) on public.therapy_sessions to authenticated;
-- Scalanie przepina wybraną trudność na cel, więc kolumna jest edytowalna;
-- każda zmiana przechodzi tę samą walidację właściciela i perspektywy.
grant update (about_difficulty_id) on public.therapy_sessions to authenticated;

create function public.therapy_sessions_check_about_difficulty()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.about_difficulty_id is not null and not exists (select 1 from public.difficulties d
    where d.id = new.about_difficulty_id and d.user_id = new.user_id and d.avatar_id is not distinct from new.avatar_id) then
    raise exception 'invalid_about_difficulty' using errcode = 'P0013';
  end if;
  return new;
end $$;
create trigger therapy_sessions_validate_about_difficulty before update of about_difficulty_id on public.therapy_sessions
  for each row execute function public.therapy_sessions_check_about_difficulty();

-- 3. Triggery tabel.
-- Normalizacja etykiety, przypięte kolumny i bump rewizji przy edycji, żeby
-- trwająca partia przegrała CAS zamiast nadpisać korektę użytkownika.
create function public.difficulties_before_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.label := btrim(new.label);
  new.label_normalized := private.normalize_person_name(new.label);
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.avatar_id := old.avatar_id;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.label is distinct from old.label or new.user_note is distinct from old.user_note
      or new.label_locked is distinct from old.label_locked or new.archived_at is distinct from old.archived_at then
      update public.people_memories set revision = gen_random_uuid(), updated_at = now()
        where user_id = old.user_id and avatar_id = old.avatar_id;
    end if;
  end if;
  return new;
end $$;
create trigger difficulties_normalize_and_touch before insert or update on public.difficulties
  for each row execute function public.difficulties_before_write();

create function public.difficulty_aliases_before_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.alias := btrim(new.alias);
  new.alias_normalized := private.normalize_person_name(new.alias);
  return new;
end $$;
create trigger difficulty_aliases_normalize before insert on public.difficulty_aliases
  for each row execute function public.difficulty_aliases_before_insert();

-- Dozwolone pary rodzic–dziecko w tej samej trudności: agreed → suggested,
-- outcome → agreed, outcome → suggested. Tylko przy zmianie rodzica lub
-- rodzaju, żeby scalanie (zmiana difficulty_id obu wierszy) nie odpalało
-- sprawdzenia, gdy rodzic jeszcze siedzi w źródle.
create function public.difficulty_entries_check_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_parent public.difficulty_entries;
begin
  if new.parent_entry_id is null then return new; end if;
  select * into v_parent from public.difficulty_entries where id = new.parent_entry_id;
  if not found or v_parent.id = new.id or v_parent.difficulty_id <> new.difficulty_id
    or not ((new.kind = 'agreed' and v_parent.kind = 'suggested')
      or (new.kind = 'outcome' and v_parent.kind in ('suggested', 'agreed'))) then
    raise exception 'invalid_difficulty_entry_parent' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger difficulty_entries_check_parent before insert or update of parent_entry_id, kind on public.difficulty_entries
  for each row execute function public.difficulty_entries_check_parent();

-- 4. Funkcje pomocnicze (schemat private tylko chowa je przed PostgREST).
create function private.normalize_difficulty_label(p_label text)
returns text language sql immutable security invoker set search_path = '' as $$
  select private.normalize_person_name(p_label);
$$;

-- Etykieta wygrywa nad aliasem.
create function private.resolve_difficulty_by_label(p_avatar_id text, p_label_normalized text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select d.id from public.difficulties d
      where d.user_id = auth.uid() and d.avatar_id = p_avatar_id and d.label_normalized = p_label_normalized),
    (select a.difficulty_id from public.difficulty_aliases a
      where a.user_id = auth.uid() and a.avatar_id = p_avatar_id and a.alias_normalized = p_label_normalized));
$$;

create function private.coerce_difficulty_effect(p_kind text, p_effect text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when p_kind in ('update', 'outcome') and p_effect in ('better', 'same', 'worse', 'resolved', 'mixed') then p_effect
    else null end;
$$;

-- Krawędź bez wpisów przy tej osobie i bez decyzji użytkownika to za mało na
-- mapę; trudność bez wpisów, notatki, blokady i archiwum znika.
create function private.prune_empty_difficulties(p_user_id uuid, p_avatar_id text)
returns void language sql security invoker set search_path = '' as $$
  delete from public.difficulty_persons dp
  using public.difficulties d
  where dp.difficulty_id = d.id and d.user_id = p_user_id and d.avatar_id = p_avatar_id and not dp.user_decided
    and not exists (select 1 from public.difficulty_entries e
      where e.difficulty_id = dp.difficulty_id and e.person_id = dp.person_id);
  delete from public.difficulties d
  where d.user_id = p_user_id and d.avatar_id = p_avatar_id
    and length(d.user_note) = 0 and not d.label_locked and d.archived_at is null
    and not exists (select 1 from public.difficulty_entries e where e.difficulty_id = d.id);
$$;

-- Data rozmowy źródłowej wpisu: najwcześniejsza z jego źródeł. Kolejność po
-- niej, nie po wstawieniu, bo wstawianie dryfuje po włączeniu „od teraz”.
create function private.difficulty_entry_conversation_at(p_entry_id uuid)
returns timestamptz language sql stable security invoker set search_path = '' as $$
  select min(s.created_at) from public.difficulty_entry_sources es
  join public.therapy_sessions s on s.id = es.session_id
  where es.entry_id = p_entry_id;
$$;

-- Osoba wskazana przez id (istniejąca) albo przez pozycję w newPersons tej
-- samej partii (mapa pozycja → id z zapisu osób). NULL = osoby nie ma.
create function private.resolve_difficulty_person(
  p_avatar_id text, p_item jsonb, p_new_person_ids jsonb
) returns uuid language sql stable security invoker set search_path = '' as $$
  select p.id from public.people_persons p
  where p.user_id = auth.uid() and p.avatar_id = p_avatar_id
    and p.id::text = case
      when jsonb_typeof(p_item->'personId') = 'string' then p_item->>'personId'
      when jsonb_typeof(p_item->'newPersonPosition') = 'number' then p_new_person_ids->>(p_item->>'newPersonPosition')
      else null end;
$$;

-- Zastosowanie jednego zestawu zmian do trudności (aktualizacja albo nowa
-- trudność złożona do istniejącej): aliasy, krawędzie, usunięcia, poprawki w
-- miejscu, nowe wpisy z rodzicem po refie albo po pozycji, okno update,
-- wzmianki. Wszystko semantyczne jest pomijane albo koergowane, nigdy nie
-- przerywa partii.
create function private.apply_difficulty_changes(
  p_difficulty_id uuid, p_avatar_id text, p_changes jsonb, p_new_person_ids jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_max_entries constant integer := 12;
  v_max_difficulty_persons constant integer := 5;
  v_max_aliases constant integer := 6;
  v_update_window constant integer := 6;
  v_item jsonb;
  v_text text;
  v_kind text;
  v_effect text;
  v_person_id uuid;
  v_entry_id uuid;
  v_old public.difficulty_entries;
  v_parent_id uuid;
  v_parent_kind text;
  v_count integer;
  v_position integer := -1;
  v_positions jsonb := '{}'::jsonb;
  v_source_id uuid;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_changes->'addAliases', '[]'::jsonb)) loop
    v_text := btrim(coalesce(v_item->>'text', ''));
    if length(v_text) = 0 or length(v_text) > 60 then continue; end if;
    if exists (select 1 from public.difficulties d where d.user_id = auth.uid() and d.avatar_id = p_avatar_id
      and d.label_normalized = private.normalize_difficulty_label(v_text)) then continue; end if;
    select count(*) into v_count from public.difficulty_aliases where difficulty_id = p_difficulty_id;
    exit when v_count >= v_max_aliases;
    insert into public.difficulty_aliases(difficulty_id, user_id, avatar_id, alias, source_session_id)
      values (p_difficulty_id, auth.uid(), p_avatar_id, v_text,
        case when jsonb_typeof(v_item->'sourceSessionId') = 'string' then (v_item->>'sourceSessionId')::uuid else null end)
      on conflict (user_id, avatar_id, alias_normalized) do nothing;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_changes->'addPersons', '[]'::jsonb)) loop
    v_person_id := private.resolve_difficulty_person(p_avatar_id, v_item, p_new_person_ids);
    if v_person_id is null then continue; end if;
    if exists (select 1 from public.difficulty_persons where difficulty_id = p_difficulty_id and person_id = v_person_id) then
      -- Pewne powiązanie potwierdza wcześniejsze niepewne; decyzja użytkownika nie do ruszenia.
      update public.difficulty_persons set state = 'confirmed'
        where difficulty_id = p_difficulty_id and person_id = v_person_id and not user_decided and state = 'suggested'
          and not coalesce((v_item->>'uncertain')::boolean, false);
      continue;
    end if;
    select count(*) into v_count from public.difficulty_persons
      where difficulty_id = p_difficulty_id and state <> 'rejected';
    if v_count >= v_max_difficulty_persons then continue; end if;
    insert into public.difficulty_persons(difficulty_id, person_id, user_id, state)
      values (p_difficulty_id, v_person_id, auth.uid(),
        case when coalesce((v_item->>'uncertain')::boolean, false) then 'suggested' else 'confirmed' end);
  end loop;

  delete from public.difficulty_entries e
    where e.difficulty_id = p_difficulty_id and e.user_id = auth.uid() and not e.user_edited
      and e.id::text in (select m #>> '{}' from jsonb_array_elements(coalesce(p_changes->'removeEntryIds', '[]'::jsonb)) m);

  -- Poprawka w miejscu: id i rodzaj zostają, więc dzieci nie tracą rodzica.
  for v_item in select * from jsonb_array_elements(coalesce(p_changes->'replaceEntries', '[]'::jsonb)) loop
    if jsonb_typeof(v_item->'entryId') <> 'string' then continue; end if;
    select * into v_old from public.difficulty_entries
      where id::text = v_item->>'entryId' and difficulty_id = p_difficulty_id and user_id = auth.uid();
    if not found or v_old.user_edited or v_old.kind is distinct from v_item->>'kind' then continue; end if;
    v_text := btrim(coalesce(v_item->>'text', ''));
    if length(v_text) = 0 or length(v_text) > 200 then continue; end if;
    v_effect := private.coerce_difficulty_effect(v_old.kind, v_item->>'effect');
    update public.difficulty_entries set text = v_text, effect = coalesce(v_effect, effect) where id = v_old.id;
    if jsonb_typeof(v_item->'sourceSessionId') = 'string' then
      insert into public.difficulty_entry_sources(entry_id, session_id, user_id)
        values (v_old.id, (v_item->>'sourceSessionId')::uuid, auth.uid()) on conflict do nothing;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_changes->'addEntries', '[]'::jsonb)) loop
    v_position := v_position + 1;
    v_kind := coalesce(v_item->>'kind', '');
    v_text := btrim(coalesce(v_item->>'text', ''));
    if v_kind not in ('how', 'coping', 'update', 'suggested', 'agreed', 'outcome')
      or length(v_text) = 0 or length(v_text) > 200 or jsonb_typeof(v_item->'sourceSessionId') <> 'string' then continue; end if;
    v_source_id := (v_item->>'sourceSessionId')::uuid;
    v_person_id := null;
    if jsonb_typeof(v_item->'personId') = 'string' or jsonb_typeof(v_item->'newPersonPosition') = 'number' then
      -- Wpis przy osobie wymaga krawędzi, która nie jest odrzucona.
      v_person_id := private.resolve_difficulty_person(p_avatar_id, v_item, p_new_person_ids);
      if v_person_id is null or not exists (select 1 from public.difficulty_persons
        where difficulty_id = p_difficulty_id and person_id = v_person_id and state <> 'rejected') then continue; end if;
    end if;
    if v_kind = 'update' then
      -- Ruchome okno: najstarszy nieedytowany „jak jest teraz” ustępuje nowemu.
      select count(*) into v_count from public.difficulty_entries
        where difficulty_id = p_difficulty_id and kind = 'update' and not user_edited;
      if v_count >= v_update_window then
        delete from public.difficulty_entries where id = (
          select e.id from public.difficulty_entries e
          where e.difficulty_id = p_difficulty_id and e.kind = 'update' and not e.user_edited
          order by private.difficulty_entry_conversation_at(e.id) nulls first, e.created_at, e.id limit 1);
      end if;
    else
      select count(*) into v_count from public.difficulty_entries
        where difficulty_id = p_difficulty_id and kind <> 'update';
      if v_count >= v_max_entries then continue; end if;
    end if;
    v_parent_id := null;
    v_parent_kind := null;
    if jsonb_typeof(v_item->'parentEntryId') = 'string' then
      select id, kind into v_parent_id, v_parent_kind from public.difficulty_entries
        where id::text = v_item->>'parentEntryId' and difficulty_id = p_difficulty_id;
    elsif jsonb_typeof(v_item->'parentPosition') = 'number' and v_positions ? (v_item->>'parentPosition') then
      select id, kind into v_parent_id, v_parent_kind from public.difficulty_entries
        where id = (v_positions->>(v_item->>'parentPosition'))::uuid and difficulty_id = p_difficulty_id;
    end if;
    if v_parent_id is not null and not ((v_kind = 'agreed' and v_parent_kind = 'suggested')
      or (v_kind = 'outcome' and v_parent_kind in ('suggested', 'agreed'))) then
      v_parent_id := null;
    end if;
    insert into public.difficulty_entries(difficulty_id, user_id, avatar_id, person_id, kind, text, effect, parent_entry_id)
      values (p_difficulty_id, auth.uid(), p_avatar_id, v_person_id, v_kind, v_text,
        private.coerce_difficulty_effect(v_kind, v_item->>'effect'), v_parent_id)
      returning id into v_entry_id;
    v_positions := v_positions || jsonb_build_object(v_position::text, v_entry_id);
    insert into public.difficulty_entry_sources(entry_id, session_id, user_id) values (v_entry_id, v_source_id, auth.uid());
    insert into public.difficulty_mentions(difficulty_id, session_id, user_id, mentioned_at)
      select p_difficulty_id, s.id, auth.uid(), s.created_at from public.therapy_sessions s
      where s.id = v_source_id and s.user_id = auth.uid()
      on conflict do nothing;
  end loop;

  insert into public.difficulty_mentions(difficulty_id, session_id, user_id, mentioned_at)
    select p_difficulty_id, s.id, auth.uid(), s.created_at
    from jsonb_array_elements(coalesce(p_changes->'mentionedSessionIds', '[]'::jsonb)) m
    join public.therapy_sessions s on s.id::text = (m #>> '{}') and s.user_id = auth.uid()
    on conflict do nothing;
end $$;

-- 5. Partia: indeks trudności obok indeksu osób. Wiadomości wracają, gdy
-- włączona jest którakolwiek z preferencji; `enabled` dalej oznacza karty
-- osób, więc stary Worker (który przy false nic nie zapisuje) działa bez zmian.
create or replace function public.get_people_memory_batch(p_avatar_id text, p_max_chars integer default 16000)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_batch_min_chars constant integer := 2000;
  v_batch_max_chars constant integer := 24000;
  v_max_messages constant integer := 128;
  v_memory public.people_memories;
  v_cursors jsonb;
  v_persons jsonb := '[]'::jsonb;
  v_difficulties jsonb := '[]'::jsonb;
  v_people_enabled boolean;
  v_topics_enabled boolean;
  v_max_chars integer;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.people_memories(user_id, avatar_id) values (auth.uid(), p_avatar_id)
    on conflict do nothing;
  select * into strict v_memory from public.people_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id;
  v_people_enabled := private.people_memory_enabled();
  v_topics_enabled := private.topic_map_enabled();
  if not v_people_enabled and not v_topics_enabled then
    return jsonb_build_object('revision', v_memory.revision, 'enabled', false, 'topicsEnabled', false,
      'persons', '[]'::jsonb, 'forgottenPeople', '[]'::jsonb, 'difficulties', '[]'::jsonb, 'messages', '[]'::jsonb);
  end if;
  v_max_chars := least(greatest(coalesce(p_max_chars, 16000), v_batch_min_chars), v_batch_max_chars);
  select coalesce(jsonb_agg(jsonb_build_object('sessionId', session_id, 'sequenceIndex', sequence_index,
    'characterOffset', character_offset)), '[]'::jsonb) into v_cursors
    from public.people_memory_sources where user_id = auth.uid() and avatar_id = p_avatar_id;
  if v_people_enabled then
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
  end if;
  if v_topics_enabled then
    select coalesce(jsonb_agg(x.difficulty order by x.last_mentioned desc nulls last, x.created_at, x.id), '[]'::jsonb)
      into v_difficulties
    from (
      select d.id, d.created_at,
        (select max(m.mentioned_at) from public.difficulty_mentions m where m.difficulty_id = d.id) as last_mentioned,
        jsonb_build_object(
          'id', d.id, 'label', d.label, 'labelLocked', d.label_locked, 'archived', d.archived_at is not null,
          'aliases', coalesce((select jsonb_agg(a.alias order by a.created_at, a.id)
            from public.difficulty_aliases a where a.difficulty_id = d.id), '[]'::jsonb),
          'persons', coalesce((select jsonb_agg(jsonb_build_object(
              'personId', dp.person_id, 'state', dp.state, 'userDecided', dp.user_decided) order by dp.created_at)
            from public.difficulty_persons dp where dp.difficulty_id = d.id), '[]'::jsonb),
          'entries', coalesce((select jsonb_agg(jsonb_build_object(
              'id', e.id, 'kind', e.kind, 'text', e.text, 'effect', e.effect, 'personId', e.person_id,
              'parentEntryId', e.parent_entry_id, 'userEdited', e.user_edited,
              'conversationAt', private.difficulty_entry_conversation_at(e.id))
              order by private.difficulty_entry_conversation_at(e.id) nulls first, e.created_at, e.id)
            from public.difficulty_entries e where e.difficulty_id = d.id), '[]'::jsonb)
        ) as difficulty
      from public.difficulties d
      where d.user_id = auth.uid() and d.avatar_id = p_avatar_id
    ) x;
  end if;
  return jsonb_build_object('revision', v_memory.revision, 'enabled', v_people_enabled,
    'topicsEnabled', v_topics_enabled, 'persons', v_persons,
    'forgottenPeople', case when v_people_enabled then private.list_forgotten_people(p_avatar_id) else '[]'::jsonb end,
    'difficulties', v_difficulties,
    'messages', private.collect_unprocessed_messages(p_avatar_id, v_cursors, v_max_chars, v_max_messages));
end $$;

-- 6. Zapis partii: te same reguły co w 20260906150000 dla osób, plus zmiany
-- trudności (difficultyUpdates, newDifficulties). Każda część jest stosowana
-- tylko przy włączonej preferencji; obie wyłączone → false, kursory stoją.
create or replace function public.save_people_memory_batch(
  p_avatar_id text, p_revision uuid, p_cursors jsonb, p_changes jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_max_persons constant integer := 40;
  v_max_facts constant integer := 12;
  v_max_difficulties constant integer := 30;
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
  v_label text;
  v_alias text;
  v_difficulty_id uuid;
  v_people_enabled boolean;
  v_topics_enabled boolean;
  v_new_person record;
  v_new_person_ids jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  if p_cursors is null or jsonb_typeof(p_cursors) <> 'array' or jsonb_array_length(p_cursors) not between 1 and 128
    or p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or jsonb_typeof(coalesce(p_changes->'newPersons', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_changes->'updates', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_changes->'newDifficulties', '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_changes->'difficultyUpdates', '[]'::jsonb)) <> 'array' then
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

  -- Każde źródło w zmianach musi pochodzić z tej partii (osoby i trudności).
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
      union all select e->>'sourceSessionId'
        from (select * from jsonb_array_elements(coalesce(p_changes->'newDifficulties', '[]'::jsonb))
              union all select * from jsonb_array_elements(coalesce(p_changes->'difficultyUpdates', '[]'::jsonb))) d(item),
          jsonb_array_elements(coalesce(d.item->'addEntries', '[]'::jsonb) || coalesce(d.item->'replaceEntries', '[]'::jsonb)) e
      union all select a->>'sourceSessionId'
        from (select * from jsonb_array_elements(coalesce(p_changes->'newDifficulties', '[]'::jsonb))
              union all select * from jsonb_array_elements(coalesce(p_changes->'difficultyUpdates', '[]'::jsonb))) d(item),
          jsonb_array_elements(coalesce(d.item->'addAliases', '[]'::jsonb)) a
        where a ? 'sourceSessionId' and jsonb_typeof(a->'sourceSessionId') = 'string'
      union all select m #>> '{}'
        from (select * from jsonb_array_elements(coalesce(p_changes->'newDifficulties', '[]'::jsonb))
              union all select * from jsonb_array_elements(coalesce(p_changes->'difficultyUpdates', '[]'::jsonb))) d(item),
          jsonb_array_elements(coalesce(d.item->'mentionedSessionIds', '[]'::jsonb)) m
    ) refs
    where refs.sid is null or not exists (
      select 1 from jsonb_to_recordset(p_cursors) as x("sessionId" uuid) where x."sessionId"::text = refs.sid)
  ) then raise exception 'unknown_people_memory_source' using errcode = '22023'; end if;

  -- Wyłączenie w trakcie generowania: nic nie zapisujemy, kursory stoją.
  v_people_enabled := private.people_memory_enabled();
  v_topics_enabled := private.topic_map_enabled();
  if not v_people_enabled and not v_topics_enabled then return false; end if;
  perform 1 from public.people_memories
    where user_id = auth.uid() and avatar_id = p_avatar_id and revision = p_revision for update;
  if not found then return false; end if;

  if v_people_enabled then
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

    -- Nowe osoby; pozycja w tablicy pozwala trudnościom z tej samej partii
    -- wskazać osobę, której id jeszcze nie znały.
    for v_new_person in
      select e.value as entry, (e.ordinality - 1)::integer as position
      from jsonb_array_elements(coalesce(p_changes->'newPersons', '[]'::jsonb)) with ordinality e
    loop
      v_entry := v_new_person.entry;
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
      v_new_person_ids := v_new_person_ids || jsonb_build_object(v_new_person.position::text, v_person_id);
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
  end if;

  if v_topics_enabled then
    -- Aktualizacje istniejących trudności.
    for v_entry in select * from jsonb_array_elements(coalesce(p_changes->'difficultyUpdates', '[]'::jsonb)) loop
      if jsonb_typeof(v_entry->'difficultyId') <> 'string' then continue; end if;
      select id into v_difficulty_id from public.difficulties
        where id::text = v_entry->>'difficultyId' and user_id = auth.uid() and avatar_id = p_avatar_id;
      if not found then continue; end if;
      perform private.apply_difficulty_changes(v_difficulty_id, p_avatar_id, v_entry, v_new_person_ids);
    end loop;

    -- Nowe trudności: pasująca etykieta albo alias składa je do istniejącej.
    for v_entry in select * from jsonb_array_elements(coalesce(p_changes->'newDifficulties', '[]'::jsonb)) loop
      v_label := btrim(coalesce(v_entry->>'label', ''));
      if length(v_label) = 0 or length(v_label) > 60 then continue; end if;
      v_difficulty_id := private.resolve_difficulty_by_label(p_avatar_id, private.normalize_difficulty_label(v_label));
      if v_difficulty_id is null then
        for v_alias in select btrim(coalesce(a->>'text', ''))
          from jsonb_array_elements(coalesce(v_entry->'addAliases', '[]'::jsonb)) a
        loop
          exit when v_difficulty_id is not null;
          if length(v_alias) between 1 and 60 then
            v_difficulty_id := private.resolve_difficulty_by_label(p_avatar_id, private.normalize_difficulty_label(v_alias));
          end if;
        end loop;
      end if;
      if v_difficulty_id is null then
        if not exists (select 1 from jsonb_array_elements(coalesce(v_entry->'addEntries', '[]'::jsonb)) e
          where coalesce(e->>'kind', '') in ('how', 'coping', 'update', 'suggested', 'agreed', 'outcome')
            and length(btrim(coalesce(e->>'text', ''))) between 1 and 200) then continue; end if;
        select count(*) into v_count from public.difficulties where user_id = auth.uid() and avatar_id = p_avatar_id;
        exit when v_count >= v_max_difficulties;
        insert into public.difficulties(user_id, avatar_id, label) values (auth.uid(), p_avatar_id, v_label)
          returning id into v_difficulty_id;
      end if;
      perform private.apply_difficulty_changes(v_difficulty_id, p_avatar_id, v_entry, v_new_person_ids);
    end loop;

    perform private.prune_empty_difficulties(auth.uid(), p_avatar_id);
  end if;

  insert into public.people_memory_sources(user_id, avatar_id, session_id, sequence_index, character_offset)
    select auth.uid(), p_avatar_id, x."sessionId", x."sequenceIndex", x."characterOffset"
    from jsonb_to_recordset(p_cursors) as x("sessionId" uuid, "sequenceIndex" integer, "characterOffset" integer)
    on conflict (user_id, avatar_id, session_id) do update
      set sequence_index = excluded.sequence_index, character_offset = excluded.character_offset;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = p_avatar_id;
  return true;
end $$;

-- 7. Karty do interfejsu.
create function private.build_difficulty_card(p_difficulty_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'avatarId', d.avatar_id, 'label', d.label, 'labelLocked', d.label_locked,
    'userNote', d.user_note, 'archivedAt', d.archived_at, 'createdAt', d.created_at,
    'aliases', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'alias', a.alias) order by a.created_at, a.id)
      from public.difficulty_aliases a where a.difficulty_id = d.id), '[]'::jsonb),
    'persons', coalesce((select jsonb_agg(jsonb_build_object(
        'personId', dp.person_id, 'name', p.display_name, 'relation', p.relation,
        'state', dp.state, 'userDecided', dp.user_decided) order by dp.created_at, dp.person_id)
      from public.difficulty_persons dp join public.people_persons p on p.id = dp.person_id
      where dp.difficulty_id = d.id), '[]'::jsonb),
    'firstMentionedAt', (select min(m.mentioned_at) from public.difficulty_mentions m where m.difficulty_id = d.id),
    'lastMentionedAt', (select max(m.mentioned_at) from public.difficulty_mentions m where m.difficulty_id = d.id),
    'mentionCount', (select count(*) from public.difficulty_mentions m where m.difficulty_id = d.id),
    'currentState', (select jsonb_build_object('id', e.id, 'text', e.text, 'effect', e.effect,
        'conversationAt', private.difficulty_entry_conversation_at(e.id))
      from public.difficulty_entries e where e.difficulty_id = d.id and e.kind = 'update'
      order by private.difficulty_entry_conversation_at(e.id) desc nulls last, e.created_at desc, e.id desc limit 1),
    'hasNewEntriesSinceArchived', d.archived_at is not null and exists (
      select 1 from public.difficulty_entries e where e.difficulty_id = d.id and e.created_at > d.archived_at),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'text', e.text, 'effect', e.effect, 'personId', e.person_id,
        'parentEntryId', e.parent_entry_id, 'userEdited', e.user_edited, 'createdAt', e.created_at,
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object('sessionId', es.session_id, 'conversationAt', s.created_at)
            order by s.created_at, es.session_id)
          from public.difficulty_entry_sources es join public.therapy_sessions s on s.id = es.session_id
          where es.entry_id = e.id), '[]'::jsonb)
      ) order by private.difficulty_entry_conversation_at(e.id) nulls first, e.created_at, e.id)
      from public.difficulty_entries e where e.difficulty_id = d.id), '[]'::jsonb)
  )
  from public.difficulties d where d.id = p_difficulty_id and d.user_id = auth.uid();
$$;

create function public.list_difficulty_cards(p_avatar_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(private.build_difficulty_card(x.id)
    order by (x.archived_at is not null), x.last_mentioned desc nulls last, x.created_at desc, x.id), '[]'::jsonb)
  from (
    select d.id, d.created_at, d.archived_at,
      (select max(m.mentioned_at) from public.difficulty_mentions m where m.difficulty_id = d.id) as last_mentioned
    from public.difficulties d where d.user_id = auth.uid() and d.avatar_id = p_avatar_id
  ) x;
$$;

create function public.get_difficulty_card(p_difficulty_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.build_difficulty_card(p_difficulty_id);
$$;

-- Edycja przez użytkownika: zmieniona etykieta zostaje zablokowana, a stara
-- etykieta staje się aliasem, żeby dawne sformułowanie dalej się składało.
-- Etykieta zajęta przez inną trudność (etykietę lub alias) → P0014, interfejs
-- proponuje scalenie.
create function public.update_difficulty_card(
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
    -- Alias tej samej trudności równy nowej etykiecie musi zniknąć (unikalność w perspektywie).
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
  return private.build_difficulty_card(v_difficulty.id);
end $$;

-- Bez wykluczenia: model może odtworzyć trudność tylko z nowych rozmów.
create function public.delete_difficulty(p_difficulty_id uuid)
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
  return true;
end $$;

-- Decyzja o krawędzi: confirmed albo rejected, zawsze z user_decided. Brak
-- krawędzi przy confirmed tworzy ją (użytkownik sam łączy osobę); rejected
-- usuwa wpisy przy tej osobie. NULL = brak trudności lub osoby właściciela.
create function public.decide_difficulty_person(p_difficulty_id uuid, p_person_id uuid, p_state text)
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
  return private.build_difficulty_card(v_difficulty.id);
end $$;

create function public.update_difficulty_entry(p_entry_id uuid, p_text text)
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
  return private.build_difficulty_card(v_entry.difficulty_id);
end $$;

-- NULL = brak takiego wpisu; `{"difficultyId", "card"}` po usunięciu, przy
-- czym `card` jest NULL, gdy trudność zniknęła razem z ostatnim wpisem.
create function public.delete_difficulty_entry(p_entry_id uuid)
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
  return jsonb_build_object('difficultyId', v_entry.difficulty_id, 'card', private.build_difficulty_card(v_entry.difficulty_id));
end $$;

-- Scalenie: źródło znika, cel dostaje wszystko. Limity nie są egzekwowane —
-- to limity „model przestaje dopisywać”, a akcja użytkownika nie traci danych.
-- NULL = brak którejś trudności u właściciela.
create function public.merge_difficulties(p_source_id uuid, p_target_id uuid)
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
  -- Oba wiersze rosnąco po UUID, żeby równoległe scalania nie zakleszczały się.
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

  -- Krawędzie: brakujące przeniesione; wspólne — decyzja użytkownika wygrywa,
  -- obie ustalone → cel, żadna → confirmed nad suggested.
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
  -- Osoba odrzucona w celu: jej wpisy ze źródła nie przechodzą.
  delete from public.difficulty_entries e
    using public.difficulty_persons tp
    where e.difficulty_id = v_source.id and e.person_id = tp.person_id
      and tp.difficulty_id = v_target.id and tp.state = 'rejected';
  update public.difficulty_entries set difficulty_id = v_target.id where difficulty_id = v_source.id;

  -- Aliasy są unikalne w perspektywie, więc przenosiny nie mogą kolidować.
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
  -- Etykieta źródła jako alias celu, chyba że koliduje z etykietą w perspektywie.
  if not exists (select 1 from public.difficulties d where d.user_id = auth.uid() and d.avatar_id = v_target.avatar_id
    and d.label_normalized = v_source.label_normalized) then
    insert into public.difficulty_aliases(difficulty_id, user_id, avatar_id, alias)
      values (v_target.id, auth.uid(), v_target.avatar_id, v_source.label)
      on conflict (user_id, avatar_id, alias_normalized) do nothing;
  end if;
  update public.people_memories set revision = gen_random_uuid(), updated_at = now()
    where user_id = auth.uid() and avatar_id = v_target.avatar_id;
  return private.build_difficulty_card(v_target.id);
end $$;

-- 8. Przełącznik mapy. Wyłączenie odłącza ją od trwających partii (zapis
-- zwraca false), zapisy zostają. Ponowne włączenie przewija kursory „od
-- teraz” — no-op, gdy karty osób je przesuwały.
create function public.set_topic_map_enabled(p_enabled boolean)
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
  if not p_enabled then return true; end if;
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

-- „Wyłącz i usuń mapę”: wszystkie trudności wszystkich perspektyw; karty
-- osób, kursory i pamięć awatara bez zmian.
create function public.disable_and_delete_topic_map()
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise insufficient_privilege; end if;
  insert into public.user_preferences(user_id, topic_map_enabled) values (auth.uid(), false)
    on conflict (user_id) do update set topic_map_enabled = false;
  delete from public.difficulties where user_id = auth.uid();
  update public.people_memories set revision = gen_random_uuid(), updated_at = now() where user_id = auth.uid();
  return true;
end $$;

-- „Wyłącz i usuń wszystkie karty osób”: jak dotąd, ale perspektywa z
-- zapisanymi trudnościami zachowuje agregat (a z nim kursory), bo trudności
-- wiszą na people_memories; znikają osoby, wykluczenia i przez kaskadę
-- krawędzie oraz wpisy przy osobach, trudności ogólne zostają.
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
  return true;
end $$;

-- 9. Zapomnienie osoby: kaskada po person_id zdejmuje krawędzie i wpisy przy
-- niej; trudność ogólna zostaje, pusta znika.
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
  return true;
end $$;

-- 10. Usunięcie rozmowy: znika też wszystko, co z niej trafiło na mapę.
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
  end if;
  return null;
end $$;

-- 11. Przypięcie kontekstu przy starcie: walidacja trudności wybranej na dziś
-- (P0013) obok osoby (P0012); brief osób bez zmian.
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
  if new.about_difficulty_id is not null and not exists (select 1 from public.difficulties d
    where d.id = new.about_difficulty_id and d.user_id = new.user_id and d.avatar_id is not distinct from new.avatar_id) then
    raise exception 'invalid_about_difficulty' using errcode = 'P0013';
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

-- 12. Uprawnienia funkcji.
revoke all on function
  private.topic_map_enabled(), private.normalize_difficulty_label(text),
  private.resolve_difficulty_by_label(text, text), private.coerce_difficulty_effect(text, text),
  private.prune_empty_difficulties(uuid, text), private.difficulty_entry_conversation_at(uuid),
  private.resolve_difficulty_person(text, jsonb, jsonb), private.apply_difficulty_changes(uuid, text, jsonb, jsonb),
  private.build_difficulty_card(uuid),
  public.list_difficulty_cards(text), public.get_difficulty_card(uuid),
  public.update_difficulty_card(uuid, text, text, boolean), public.delete_difficulty(uuid),
  public.decide_difficulty_person(uuid, uuid, text), public.update_difficulty_entry(uuid, text),
  public.delete_difficulty_entry(uuid), public.merge_difficulties(uuid, uuid),
  public.set_topic_map_enabled(boolean), public.disable_and_delete_topic_map()
  from public, anon;
grant execute on function
  private.topic_map_enabled(), private.normalize_difficulty_label(text),
  private.resolve_difficulty_by_label(text, text), private.coerce_difficulty_effect(text, text),
  private.prune_empty_difficulties(uuid, text), private.difficulty_entry_conversation_at(uuid),
  private.resolve_difficulty_person(text, jsonb, jsonb), private.apply_difficulty_changes(uuid, text, jsonb, jsonb),
  private.build_difficulty_card(uuid),
  public.list_difficulty_cards(text), public.get_difficulty_card(uuid),
  public.update_difficulty_card(uuid, text, text, boolean), public.delete_difficulty(uuid),
  public.decide_difficulty_person(uuid, uuid, text), public.update_difficulty_entry(uuid, text),
  public.delete_difficulty_entry(uuid), public.merge_difficulties(uuid, uuid),
  public.set_topic_map_enabled(boolean), public.disable_and_delete_topic_map()
  to authenticated;
revoke all on function public.difficulties_before_write(), public.difficulty_aliases_before_insert(),
  public.difficulty_entries_check_parent(), public.therapy_sessions_check_about_difficulty()
  from public, anon, authenticated;
