-- Soczewka tematyczna rozmowy (etap 4 planu kart osób): etykieta tematu, którą
-- tani klasyfikator nadaje raz na sesję (lepka), a prompt odpowiedzi dokleja
-- do sekcji nurtu jako „co słyszeć i o co pytać”. Kolumna jest prywatna dla
-- właściciela: mówi, o czym jest rozmowa, więc nigdy nie trafia do logów ani
-- do agregatów operatora. Addytywna: NULL dla wszystkich istniejących sesji,
-- stary Worker jej nie czyta ani nie zapisuje. Trigger cyklu życia ocenia
-- tylko zmianę statusu, więc zapis samej soczewki na aktywnej sesji przechodzi.
alter table public.therapy_sessions add column session_lens text
  constraint therapy_sessions_session_lens_check check (
    session_lens is null or session_lens in ('family_of_origin', 'work_burnout', 'anxiety_avoidance')
  );

grant update (session_lens) on table public.therapy_sessions to authenticated;
