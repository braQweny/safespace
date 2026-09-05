-- Usunięcie własnego konta nie wymaga klucza service_role w Workerze.
-- Uprzywilejowana funkcja pozostaje poza schematem wystawionym w Data API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Zachowujemy zdarzenia administracyjne bez identyfikatora usuniętego autora.
-- Również administrator może usunąć swoje konto.
alter table public.admin_audit_events alter column admin_user_id drop not null;
alter table public.admin_audit_events drop constraint admin_audit_events_admin_user_id_fkey;
alter table public.admin_audit_events add constraint admin_audit_events_admin_user_id_fkey
  foreign key (admin_user_id) references auth.users(id) on delete set null;

-- Usunięcie administratora nie może odblokować innych kont ani naruszyć CHECK
-- po wyzerowaniu blocked_by przez FK. Stan blokady zachowujemy bez autora.
alter table public.admin_user_profiles drop constraint admin_user_profiles_block_state_check;
alter table public.admin_user_profiles add constraint admin_user_profiles_block_state_check check (
  (blocked_at is null and blocked_by is null and block_reason_code is null)
  or (blocked_at is not null and block_reason_code is not null)
);

create function private.delete_own_account(p_confirmation text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'missing_auth' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'USUWAM' then
    raise exception 'account_deletion_confirmation_required' using errcode = '22023';
  end if;

  -- Jedna transakcja: Auth (wraz z sesjami i tokenami odświeżania), profil,
  -- rozmowy, wiadomości, podsumowania, pamięć awatarów i jej kopie — przez FK.
  -- Nie przyjmujemy identyfikatora konta od wywołującego.
  delete from auth.users where id = v_user_id;
  return found;
end $$;
revoke all on function private.delete_own_account(text) from public, anon;
grant execute on function private.delete_own_account(text) to authenticated;

create function public.delete_own_account(p_confirmation text)
returns boolean language sql security invoker set search_path = '' as $$
  select private.delete_own_account(p_confirmation);
$$;
revoke all on function public.delete_own_account(text) from public, anon;
grant execute on function public.delete_own_account(text) to authenticated;
