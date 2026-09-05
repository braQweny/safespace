-- Preferencje konta (dziś: język interfejsu). Cookie jest źródłem prawdy per
-- żądanie; ten wiersz synchronizuje je między urządzeniami przy logowaniu.
-- Migracja jest addytywna: wdrożony Worker nigdy tej tabeli nie czyta ani
-- nie zapisuje, a nowy traktuje brak wiersza jako „bez wyboru”.

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_locale_check check (locale in ('en', 'pl'))
);

alter table public.user_preferences enable row level security;

create policy "Users can read their own preferences"
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Bez polityki delete: jedyną drogą jest kaskada z auth.users
-- (delete_own_account).

-- Granty: najpierw revoke. Domyślne uprawnienia Supabase dają anon i
-- authenticated ALL na każdej nowej tabeli, więc grant kolumnowy zawęża
-- cokolwiek dopiero po revoke na poziomie tabeli (CLAUDE.md, 20260901120000).
revoke all privileges on table public.user_preferences from anon, authenticated;

grant select on table public.user_preferences to authenticated;
grant insert (user_id, locale) on table public.user_preferences to authenticated;
-- `user_id` musi być w grancie update: upsert PostgREST wpisuje każdą kolumnę
-- payloadu do `on conflict do update set`. Trigger niżej przypina go do `old`.
grant update (user_id, locale) on table public.user_preferences to authenticated;

create function public.set_user_preferences_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.user_id = old.user_id;
    new.created_at = old.created_at;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger user_preferences_set_metadata
  before insert or update on public.user_preferences
  for each row
  execute function public.set_user_preferences_metadata();
