-- Rozmowa głosowa: znaczniki czasu puli należą do serwera, a zużycie liczy baza.
--
-- Co się zmienia i dlaczego:
--   * `voice_connected_at` — właściciel ma grant update (Worker zapisuje
--     pierwsze połączenie jego JWT), więc bezpośredni PATCH przez PostgREST
--     mógł wpisać dowolną datę (1970, przyszłość) i wyzerować zużycie puli.
--     Pierwszy zapis dostaje teraz `now()` bazy niezależnie od wartości z
--     żądania; potem kolumna zostaje zamrożona jak dotąd.
--   * `ended_at` — grant update istniał od `20260901120000`, ale nic go nie
--     zamrażało: `ended_at = voice_connected_at` zerował zużycie, a późny
--     `ended_at` rozciągał 60-sekundowe okno zrzutu wypowiedzi po końcu
--     rozmowy. Teraz stempluje go serwer (`now()`) w chwili przejścia w stan
--     końcowy, a raz ustawiony jest zamrożony. Wiersz nieprzechodzący w stan
--     końcowy nie może dostać `ended_at`.
--   * `get_owned_voice_usage(timestamptz, uuid)` — zużycie miesięcznej puli
--     liczone w bazie bez limitu wierszy (poprzedni odczyt w aplikacji ucinał
--     listę na 200 rozmowach, więc 201. i dalsze były darmowe), pod RLS
--     właściciela. Zwraca sekundy zużyte oraz sekundy zarezerwowane przez inne
--     trwające rozmowy (do ich `expires_at`), żeby `connect` nie wpuścił kilku
--     równoległych rozmów ponad pulę.
--
-- Zgodność z wdrożonym Workerem (migracja idzie przed publikacją kodu):
--   * obecny kod zapisuje `voice_connected_at` i `ended_at` jako „teraz” z
--     zegara Workera tylko przy pierwszym połączeniu i przy przejściach
--     `active → completed | expired | interrupted` (`transitionSessionLifecycle`
--     wysyła `ended_at` także przy `created → active`, ale jako `null`);
--     zastąpienie tych wartości zegarem bazy nie zmienia żadnej ścieżki,
--   * `delete_owned_session` przekazuje `coalesce(p_ended_at, ended_at)`;
--     aplikacja nie podaje `p_ended_at`, więc zamrożenie niczego nie psuje, a
--     usunięcie trwającej rozmowy dostaje wreszcie prawdziwy koniec zamiast
--     `null` (zużycie puli nie biegnie dalej do `expires_at`),
--   * odczyt `listOwnedVoiceSessionTimings` starego Workera działa dalej;
--     funkcja jest addytywna.
--
-- Wiersze sfałszowane przed tą migracją nie są naprawiane: nie da się odtworzyć
-- prawdziwego czasu połączenia, a pula zeruje się z nowym miesiącem UTC.
-- `schema-drift.test.ts` pinuje reguły, `tests/database/voice-sessions.test.mjs`
-- sprawdza je na prawdziwym PostgreSQL.

-- 1. Trigger metadanych: reszta bez zmian względem 20260912200000.
create or replace function public.set_therapy_sessions_metadata()
returns trigger
language plpgsql
set search_path = ''
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

    -- The budget is pinned when the session goes active; nothing after that
    -- (the owner, a plan change, a late request) may stretch or cut it.
    -- Przed `ended_at`: koniec liczy się z zamrożonego startu, nigdy ze
    -- `started_at` przysłanego w tym samym żądaniu.
    if old.status <> 'created' then
      new.started_at = old.started_at;
      new.expires_at = old.expires_at;
      new.duration_bucket_seconds = old.duration_bucket_seconds;
    end if;

    -- Pierwsze połączenie audio liczy się do puli minut: czas nadaje baza,
    -- nigdy żądanie, a późniejsze reconnecty go nie przesuwają.
    if old.voice_connected_at is not null then
      new.voice_connected_at = old.voice_connected_at;
    elsif new.voice_connected_at is not null then
      new.voice_connected_at = now();
    end if;

    -- Koniec rozmowy stempluje baza przy przejściu w stan końcowy i nic
    -- później go nie przesuwa: od niego liczy się zużycie puli głosowej i okno
    -- zrzutu ostatnich wypowiedzi. Start może wyprzedzać zegar bazy najwyżej o
    -- 5 s (zegar Workera; ten sam zapas daje `enforce_session_lifecycle`) i o
    -- tyle `greatest` przesuwa koniec, żeby przejść kontrolę
    -- `ended_at >= started_at`. Dalszy start — możliwy tylko w wierszu
    -- `created`, gdzie `started_at` jest jeszcze zapisywalne — nie przesuwa
    -- końca w przyszłość: kontrola odrzuca takie żądanie, zamiast otworzyć
    -- okno zrzutu na zawsze. Usunięcie rozmowy, która nigdy nie ruszyła, nie
    -- ma końca.
    if old.ended_at is not null then
      new.ended_at = old.ended_at;
    elsif new.status is distinct from old.status and (
      new.status in ('completed', 'expired', 'interrupted')
      or (new.status = 'deleted' and old.status = 'active')
    ) then
      new.ended_at = greatest(now(), least(coalesce(new.started_at, now()), now() + interval '5 seconds'));
    else
      new.ended_at = null;
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

-- 2. Zużycie miesięcznej puli głosowej, bez limitu wierszy.
--
-- Rozmowa zużywa czas od `voice_connected_at` do najwcześniejszego z:
-- `ended_at`, `expires_at`, teraz — nigdy więcej niż swój bucket. Obserwator
-- rozłącza sesję live przed `expires_at`, więc późne przejście w `expired`
-- (odczyt dzień po terminie) nie dolicza godzin, których nikt nie przegadał.
-- Trwająca rozmowa (aktywna, bez `ended_at`) poza `p_exclude_session_id`
-- rezerwuje resztę do swojego `expires_at`: może zostać wznowiona do terminu.
-- Tombstone liczy się jak każda inna rozmowa — usunięcie nie zwraca minut.
create function public.get_owned_voice_usage(
  p_since timestamptz,
  p_exclude_session_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with timings as (
    select
      sessions.id,
      sessions.status,
      sessions.ended_at,
      sessions.expires_at,
      sessions.duration_bucket_seconds,
      -- `least` / `greatest` pomijają NULL: brak bucketu = brak sufitu.
      least(
        greatest(
          extract(epoch from
            least(coalesce(sessions.ended_at, now()), sessions.expires_at, now())
            - sessions.voice_connected_at
          ),
          0
        ),
        sessions.duration_bucket_seconds
      ) as used_seconds
    from public.therapy_sessions as sessions
    where sessions.user_id = (select auth.uid())
      and sessions.mode = 'voice'
      and sessions.voice_connected_at is not null
      and sessions.voice_connected_at >= p_since
  )
  select jsonb_build_object(
    'used_seconds', coalesce(round(sum(timings.used_seconds)), 0)::integer,
    'reserved_seconds', coalesce(round(sum(
      case
        when timings.status = 'active'
          and timings.ended_at is null
          and timings.id is distinct from p_exclude_session_id
        then coalesce(
          least(
            greatest(extract(epoch from timings.expires_at - now()), 0),
            timings.duration_bucket_seconds - timings.used_seconds
          ),
          0
        )
        else 0
      end
    )), 0)::integer
  )
  from timings;
$$;

revoke execute on function public.get_owned_voice_usage(timestamptz, uuid) from public, anon;
grant execute on function public.get_owned_voice_usage(timestamptz, uuid) to authenticated;
