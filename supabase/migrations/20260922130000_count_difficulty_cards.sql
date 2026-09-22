-- Liczby do wiersza-skrótu „Co Lena pamięta” na /dashboard bez budowania kart.
--
-- Panel pokazywał trzy liczby (osoby, tematy, „do potwierdzenia”), a czytał po
-- to każdą kartę z faktami i wpisami. Osoby liczy zwykły head count pod RLS;
-- tematy i niepewne powiązania czyta ta funkcja jednym zapytaniem, tak jak
-- wcześniej jeden odczyt `list_difficulty_cards` karmił obie liczby.
--
-- Te same filtry co lista, bez żadnych nowych reguł:
-- - `cards`: każda trudność właściciela w perspektywie, także „mniej
--   aktualna” (`archived_at`) — `list_difficulty_cards` zwraca ją na końcu;
-- - `pendingLinks`: krawędź `suggested` bez decyzji użytkownika (reguła
--   `listPendingLinks`), dołączona do osoby widocznej pod RLS, jak w
--   `private.build_difficulty_card`.
--
-- Addytywna: stary Worker jej nie woła. Wynik to same liczby, bez treści.

create function public.count_difficulty_cards(p_avatar_id text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cards', (select count(*) from public.difficulties d
      where d.user_id = auth.uid() and d.avatar_id = p_avatar_id),
    'pendingLinks', (select count(*) from public.difficulties d
      join public.difficulty_persons dp on dp.difficulty_id = d.id
      join public.people_persons p on p.id = dp.person_id
      where d.user_id = auth.uid() and d.avatar_id = p_avatar_id
        and dp.state = 'suggested' and not dp.user_decided)
  );
$$;

revoke all on function public.count_difficulty_cards(text) from public, anon, authenticated;
grant execute on function public.count_difficulty_cards(text) to authenticated;
