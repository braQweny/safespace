-- Rozmowa głosowa (GPT-Live-1), etap 1: schemat i bramki.
--
-- Co dochodzi i dlaczego:
--   * `therapy_sessions.mode` (`text` | `voice`) — tryb rozmowy ustalany przy
--     insercie i zamrożony (bez grantu update, trigger metadanych przepisuje
--     starą wartość). Tryby są rozłączne: wiadomość tekstowa nie może trafić
--     do transkryptu, którego model głosowy nie słyszał, i odwrotnie.
--   * `therapy_sessions.voice_connected_at` — pierwsze udane połączenie audio;
--     od niego liczy się miesięczna pula minut premium (odmowa mikrofonu
--     kosztuje 0 minut). Zapis tylko `null → wartość`, potem zamrożony.
--   * bucket 600 s — jednorazowa próba głosowa konta free (10 minut).
--   * limit 3 rozmów free liczy odtąd tylko `mode = 'text'`; próba głosowa
--     free to jeden wiersz `mode = 'voice'` na konto w każdym statusie
--     (tombstone też — usunięcie nie przywraca próby): SQLSTATE `P0016`.
--   * `session_messages.utterance_id` — idempotentny zrzut wypowiedzi
--     transkryptu (id nadaje serwer); partial unique index per sesja.
--   * `append_voice_session_utterances(uuid, jsonb)` — jedyna ścieżka zapisu
--     transkryptu głosowego: właściciel, blokada wiersza sesji, `P0015` dla
--     sesji tekstowej, indeksy max+1, pominięcie znanych `utterance_id`.
--   * okno 60 s po zamknięciu rozmowy głosowej na zrzut ostatnich wypowiedzi
--     (w `guard_session_content_insert` i w RPC), bo model bywa w połowie
--     zdania, gdy termin mija.
--
-- Addytywna: stary Worker nie czyta ani nie zapisuje nowych kolumn, a
-- `mode` ma domyślne `text`. Funkcje zastępowane zachowują dotychczasowe
-- zachowanie dla wierszy tekstowych. `schema-drift.test.ts` przypina wartości
-- trybu, bucket 600, oba SQLSTATE i granty; `tests/database/voice-sessions.test.mjs`
-- sprawdza bramki na prawdziwym PostgreSQL.

-- 1. Tryb rozmowy: ustalany przy insercie, bez grantu update.
alter table public.therapy_sessions
  add column mode text not null default 'text'
  constraint therapy_sessions_mode_check check (mode in ('text', 'voice'));

grant insert (mode) on table public.therapy_sessions to authenticated;

-- 2. Aktywacja połączenia głosowego: tylko właściciel, tylko `null → wartość`.
alter table public.therapy_sessions add column voice_connected_at timestamptz;

grant update (voice_connected_at) on table public.therapy_sessions to authenticated;

-- 3. Bucket 600 s dla próby głosowej konta free.
alter table public.therapy_sessions drop constraint therapy_sessions_duration_bucket_seconds_check;
alter table public.therapy_sessions
  add constraint therapy_sessions_duration_bucket_seconds_check check (
    duration_bucket_seconds is null
    or duration_bucket_seconds in (0, 300, 600, 900, 1800, 3600)
  );

-- 4. Zamrożenie trybu i aktywacji w triggerze metadanych (reszta bez zmian
--    względem 20260901120000).
create or replace function public.set_therapy_sessions_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.id = old.id;
    new.user_id = old.user_id;
    new.created_at = old.created_at;
    new.is_trial = old.is_trial;
    new.uses_approved_context = old.uses_approved_context;
    -- Tryb rozmowy jest decyzją startu; nic później nie może go zmienić.
    new.mode = old.mode;

    if old.trial_claim_id is not null then
      new.trial_claim_id = old.trial_claim_id;
    end if;

    -- Pierwsze połączenie audio liczy się do puli minut; późniejsze
    -- reconnecty nie przesuwają go.
    if old.voice_connected_at is not null then
      new.voice_connected_at = old.voice_connected_at;
    end if;

    -- The budget is pinned when the session goes active; nothing after that
    -- (the owner, a plan change, a late request) may stretch or cut it.
    if old.status <> 'created' then
      new.started_at = old.started_at;
      new.expires_at = old.expires_at;
      new.duration_bucket_seconds = old.duration_bucket_seconds;
    end if;

    if old.status = 'deleted' then
      new.status = 'deleted';
      new.deleted_at = old.deleted_at;
      new.deletion_reason_code = old.deletion_reason_code;
    end if;
  end if;

  if new.is_trial and new.duration_bucket_seconds is null then
    new.duration_bucket_seconds = 900;
  end if;

  if new.status = 'deleted' then
    new.modality_id = null;
    new.avatar_id = null;

    if new.deleted_at is null then
      new.deleted_at = now();
    end if;
  else
    new.deleted_at = null;
    new.deletion_reason_code = null;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

-- 5. Limit free liczy tylko rozmowy tekstowe; próba głosowa free = jeden wiersz.
create or replace function public.enforce_free_plan_session_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit constant integer := 3;
  v_voice_trial_bucket constant integer := 600;
  v_used_sessions integer;
  v_voice_sessions integer;
begin
  -- Premium accounts are not capped; the voice pool is enforced by the app
  -- (expires_at at start, the observer's deadline), not by this trigger.
  if private.account_has_premium(new.user_id) then
    return new;
  end if;

  -- Serialise concurrent starts of the same user for the rest of this
  -- transaction, so the counts below cannot race another insert.
  perform pg_advisory_xact_lock(
    hashtext('therapy_sessions_free_plan_limit'),
    hashtext(new.user_id::text)
  );

  if new.mode = 'voice' then
    -- Jednorazowa próba: każdy własny wiersz głosowy (każdy status, tombstone
    -- też) ją zużywa, więc usunięcie rozmowy jej nie przywraca.
    select count(*)
    into v_voice_sessions
    from public.therapy_sessions as sessions
    where sessions.user_id = new.user_id
      and sessions.mode = 'voice';

    if v_voice_sessions >= 1 then
      raise exception
        using
          errcode = 'P0016',
          message = 'voice_trial_already_used';
    end if;

    if coalesce(new.duration_bucket_seconds, 0) <> v_voice_trial_bucket then
      raise exception
        using
          errcode = 'P0006',
          message = 'voice_trial_budget_exceeded';
    end if;

    return new;
  end if;

  -- Every owned text row counts: any lifecycle status, deleted tombstones
  -- included. Voice rows live in their own allowance.
  select count(*)
  into v_used_sessions
  from public.therapy_sessions as sessions
  where sessions.user_id = new.user_id
    and sessions.mode = 'text';

  if v_used_sessions >= v_limit then
    raise exception
      using
        errcode = 'P0005',
        message = 'free_plan_session_limit_reached';
  end if;

  return new;
end;
$$;

-- 6. Idempotentny zrzut wypowiedzi transkryptu.
alter table public.session_messages add column utterance_id uuid;

create unique index session_messages_utterance_idx
  on public.session_messages (session_id, utterance_id)
  where utterance_id is not null;

grant insert (utterance_id) on table public.session_messages to authenticated;

-- 7. Okno zrzutu po zamknięciu rozmowy głosowej. Reszta bez zmian względem
--    20260904204248: blokada wiersza, aktywna i niewygasła sesja dla wiadomości,
--    nieusunięta dla podsumowań.
create or replace function public.guard_session_content_insert()
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
    -- Rozmowa głosowa: obserwator zrzuca ostatnie wypowiedzi tuż po końcu.
    if v_session.mode = 'voice'
      and v_session.status in ('completed', 'expired', 'interrupted')
      and v_session.ended_at is not null
      and clock_timestamp() <= v_session.ended_at + interval '60 seconds'
    then
      return new;
    end if;
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

-- 8. Jedyna ścieżka zapisu transkryptu głosowego.
create function public.append_voice_session_utterances(p_session_id uuid, p_utterances jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.therapy_sessions;
  v_item jsonb;
  v_utterance_id uuid;
  v_role text;
  v_content text;
  v_index integer;
  v_row public.session_messages;
  v_messages jsonb := '[]'::jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if p_utterances is null
    or jsonb_typeof(p_utterances) <> 'array'
    or jsonb_array_length(p_utterances) > 50
  then
    raise exception 'invalid_utterance_batch' using errcode = '22023';
  end if;

  select * into v_session from public.therapy_sessions
  where id = p_session_id and user_id = (select auth.uid())
  for update;
  if not found or v_session.status = 'deleted' then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if v_session.mode <> 'voice' then
    raise exception 'session_mode_mismatch' using errcode = 'P0015';
  end if;
  if jsonb_array_length(p_utterances) = 0 then
    return jsonb_build_object('inserted', 0, 'skipped', 0, 'messages', v_messages);
  end if;

  -- To samo okno, co w guard_session_content_insert.
  if v_session.status <> 'active' and not (
    v_session.status in ('completed', 'expired', 'interrupted')
    and v_session.ended_at is not null
    and clock_timestamp() <= v_session.ended_at + interval '60 seconds'
  ) then
    raise exception 'session_not_active' using errcode = 'P0004';
  end if;
  if v_session.status = 'active'
    and (v_session.expires_at is null or v_session.expires_at <= clock_timestamp())
  then
    raise exception 'session_expired' using errcode = 'P0007';
  end if;

  select coalesce(max(sequence_index) + 1, 0) into v_index
  from public.session_messages
  where session_id = p_session_id and user_id = (select auth.uid());

  for v_item in select value from jsonb_array_elements(p_utterances) loop
    begin
      v_utterance_id := (v_item ->> 'utterance_id')::uuid;
    exception when others then
      raise exception 'invalid_utterance' using errcode = '22023';
    end;
    v_role := v_item ->> 'role';
    v_content := v_item ->> 'content';
    if v_utterance_id is null
      or v_role is null
      or v_role not in ('user', 'assistant')
      or v_content is null
      or length(btrim(v_content)) not between 1 and 3000
    then
      raise exception 'invalid_utterance' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.session_messages
      where session_id = p_session_id and utterance_id = v_utterance_id
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.session_messages (session_id, user_id, role, sequence_index, content, utterance_id)
    values (p_session_id, (select auth.uid()), v_role, v_index, v_content, v_utterance_id)
    returning * into v_row;
    v_index := v_index + 1;
    v_inserted := v_inserted + 1;
    v_messages := v_messages || jsonb_build_array(to_jsonb(v_row));
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'messages', v_messages);
end;
$$;

revoke execute on function public.append_voice_session_utterances(uuid, jsonb) from public, anon;
grant execute on function public.append_voice_session_utterances(uuid, jsonb) to authenticated;
