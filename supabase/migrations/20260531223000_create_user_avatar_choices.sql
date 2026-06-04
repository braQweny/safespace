create table public.user_avatar_choices (
  user_id uuid primary key references auth.users(id) on delete cascade,
  modality_id text not null,
  avatar_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_avatar_choices_modality_id_check check (
    modality_id in (
      'psychodynamic',
      'cbt',
      'humanistic_experiential',
      'systemic',
      'integrative'
    )
  ),
  constraint user_avatar_choices_avatar_id_check check (
    avatar_id in (
      'psychodynamic-listener',
      'cbt-guide',
      'experiential-companion',
      'systemic-connector',
      'integrative-guide'
    )
  ),
  constraint user_avatar_choices_pair_check check (
    (modality_id = 'psychodynamic' and avatar_id = 'psychodynamic-listener')
    or (modality_id = 'cbt' and avatar_id = 'cbt-guide')
    or (
      modality_id = 'humanistic_experiential'
      and avatar_id = 'experiential-companion'
    )
    or (modality_id = 'systemic' and avatar_id = 'systemic-connector')
    or (modality_id = 'integrative' and avatar_id = 'integrative-guide')
  )
);

alter table public.user_avatar_choices enable row level security;

create policy "Users can read their own avatar choice"
  on public.user_avatar_choices
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own avatar choice"
  on public.user_avatar_choices
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own avatar choice"
  on public.user_avatar_choices
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on table public.user_avatar_choices to authenticated;

create function public.set_user_avatar_choices_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_avatar_choices_set_updated_at
  before update on public.user_avatar_choices
  for each row
  execute function public.set_user_avatar_choices_updated_at();
