revoke insert, update on table public.user_avatar_choices from authenticated;

grant insert (user_id, modality_id, avatar_id)
  on table public.user_avatar_choices
  to authenticated;

grant update (user_id, modality_id, avatar_id)
  on table public.user_avatar_choices
  to authenticated;

create or replace function public.set_user_avatar_choices_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
  else
    new.created_at = old.created_at;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_avatar_choices_set_updated_at on public.user_avatar_choices;

create trigger user_avatar_choices_set_updated_at
  before insert or update on public.user_avatar_choices
  for each row
  execute function public.set_user_avatar_choices_updated_at();
