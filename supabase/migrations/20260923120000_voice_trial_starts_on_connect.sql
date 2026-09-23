-- Rozmowa głosowa: próbę konta free zużywa pierwsze udane połączenie audio,
-- a zegar rozmowy rusza właśnie wtedy — nie przy wstawieniu wiersza.
--
-- Co się zmienia i dlaczego:
--   * Dotąd każdy wiersz `mode = 'voice'` konta free (każdy status, tombstone
--     też) zużywał jednorazową próbę już w `start-next`, a `started_at` /
--     `expires_at` biegły od startu — zanim przeglądarka zapytała o mikrofon.
--     Odmowa zgody albo brak mikrofonu zabierały próbę na zawsze, a 10 minut
--     mijało bez rozmowy.
--   * Bramka próby (`P0016`, `enforce_free_plan_session_limit`) liczy odtąd
--     tylko wiersze, które próbę naprawdę trzymają:
--       - połączone kiedykolwiek (`voice_connected_at is not null`) — każdy
--         status, tombstone też; kolumna jest zamrożona od pierwszego zapisu,
--         więc usunięcie użytej próby dalej jej nie przywraca,
--       - wciąż trwające: `created` / `active` przed własnym `expires_at`
--         (brak terminu liczy się jak trwający). Wiersz `active` po terminie
--         nie trwa: `connect` odmawia go połączyć (po terminie i w ostatnich
--         15 s), a bez tego warunku rozmowa porzucona przed mikrofonem
--         blokowałaby próbę, dopóki ktoś nie uzgodni jej statusu.
--     Rozmowa zakończona, wygasła, przerwana albo usunięta bez połączenia nie
--     liczy się. Repozytorium (`countOwnedVoiceSessions`) liczy tak samo.
--     Prawdziwą bramką płatnej sesji live zostaje Worker: `connect` daje
--     rozmowie z bucketem próby łącznie 600 s w całej historii konta
--     (`readVoiceConnectAllowance` z `get_owned_voice_usage`), więc dwa
--     niepołączone wiersze — nawet założone z pominięciem aplikacji — nie
--     dostaną po 600 s każdy.
--   * Trigger metadanych przy pierwszym zapisie `voice_connected_at`
--     (`null → wartość`, wiersz głosowy `active → active`) przesuwa
--     `started_at` na `now()` bazy, a `expires_at` o tę samą różnicę: czas
--     trwania (`expires_at - started_at`, dla premium już przycięty do reszty
--     puli) zostaje, a start nigdy się nie cofa (`greatest(…, 0)`, gdy zegar
--     Workera wyprzedzał bazę). `started_at` równa się wtedy
--     `voice_connected_at`. Przesunięcie liczy się wyłącznie z wartości
--     serwera (`old.*`, `now()`), już po zamrożeniu budżetu, więc nic z
--     żądania go nie zmienia. Reconnect (kolumna już ustawiona), wiersz
--     `created`, przejście w stan końcowy i rozmowa tekstowa nie są
--     przesuwane.
--
-- Kolejność triggerów BEFORE (alfabetyczna): `therapy_sessions_enforce_budget`
-- i `therapy_sessions_enforce_lifecycle` odpalają przed
-- `therapy_sessions_set_metadata` i widzą żądanie, które nie zmienia ani
-- startu, ani terminu, ani statusu — nie mają czego oceniać. Wynik spełnia
-- `therapy_sessions_time_order_check` (`expires_at >= started_at`, bez
-- `ended_at`) i limit bucketu (różnica bez zmian). Późniejszy
-- `therapy_sessions_validate_about_difficulty` odpala tylko przy zmianie
-- `about_difficulty_id`, a triggery AFTER reagują na insert albo `status`.
--
-- Zgodność z wdrożonym Workerem (migracja idzie przed publikacją kodu):
--   * stary `start-next` wstawia wiersz jak dotąd; bramka jest łagodniejsza,
--     a jego pre-flight (liczy każdy wiersz głosowy) surowszy — w najgorszym
--     razie stary panel pokaże „próba wykorzystana” o próbie, której trigger
--     już by nie odmówił,
--   * stary `connect` liczy termin obserwatora z `expires_at` sprzed
--     przesunięcia (wcześniejszy niż nowy w bazie), tym samym terminem steruje
--     timerem klienta i uzbraja obserwatora starym `started_at`. Sesja live
--     kończy się więc najpóźniej tam, gdzie kończyła się dotąd — bez
--     nadużycia próby ani puli. Heartbeat przenosi wiersz w `expired` po
--     zamknięciu obserwatora (`time_limit_reached`), zużycie liczy się od
--     `voice_connected_at` do `ended_at` jak dotąd, a rezerwa trwającej
--     rozmowy sięga nowego, późniejszego `expires_at` — ostrożnie, nie za
--     mało,
--   * żadna kolumna, grant ani sygnatura się nie zmienia; obie funkcje są
--     zastępowane w całości, reszta ich ciał bez zmian względem
--     `20260922120000` (metadane) i `20260912200000` (limit).
--
-- `schema-drift.test.ts` pinuje reguły, `tests/database/voice-sessions.test.mjs`
-- sprawdza je na prawdziwym PostgreSQL.

-- 1. Trigger metadanych: przesunięcie zegara przy pierwszym połączeniu.
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

      -- Zegar rozmowy głosowej rusza od pierwszego połączenia, nie od startu:
      -- start i termin przesuwają się o ten sam odcinek, więc czas trwania
      -- zostaje, a start nigdy się nie cofa. Tylko z wartości serwera, po
      -- zamrożeniu budżetu wyżej.
      if old.mode = 'voice'
        and old.status = 'active'
        and new.status = 'active'
        and old.started_at is not null
        and old.expires_at is not null
      then
        new.started_at = old.started_at + greatest(now() - old.started_at, interval '0');
        new.expires_at = old.expires_at + greatest(now() - old.started_at, interval '0');
      end if;
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

-- 2. Próba głosowa free: trzymają ją tylko wiersze połączone albo trwające.
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
    -- Jednorazową próbę zużywa pierwsze połączenie audio: wiersz połączony
    -- kiedykolwiek (każdy status, tombstone też — `voice_connected_at` jest
    -- zamrożone, więc usunięcie jej nie przywraca) albo wciąż trwający przed
    -- swoim terminem. Rozmowa zakończona bez połączenia jej nie zabiera.
    select count(*)
    into v_voice_sessions
    from public.therapy_sessions as sessions
    where sessions.user_id = new.user_id
      and sessions.mode = 'voice'
      and (
        sessions.voice_connected_at is not null
        or (
          sessions.status in ('created', 'active')
          and (sessions.expires_at is null or sessions.expires_at > now())
        )
      );

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
