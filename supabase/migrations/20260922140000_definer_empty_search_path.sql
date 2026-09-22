-- Pusta ścieżka wyszukiwania dla ostatnich funkcji SECURITY DEFINER, które
-- jeszcze miały `search_path = public`.
--
-- Konwencja repo to `set search_path = ''`: funkcja działająca z prawami
-- właściciela nie może rozwiązać nazwy przez schemat, do którego ktoś inny
-- mógłby coś dopisać. Ciała tych sześciu funkcji (ostatnie definicje:
-- `20260606120000`, `20260607190000`, `20260905175333`) są już w pełni
-- kwalifikowane — `public.*`, `private.*`, `auth.uid()`, reszta z `pg_catalog`,
-- który jest przeszukiwany zawsze — więc zmiana ścieżki nie zmienia działania.
-- `alter function` zostawia ciało, właściciela i granty bez zmian.
--
-- Zgodna z wdrożonym kodem: sygnatury i wyniki bez zmian.
-- `tests/database/function-hardening.test.mjs` pilnuje, że żadna funkcja
-- SECURITY DEFINER w `public`/`private` nie ma niepustej ścieżki.

alter function public.is_private_admin() set search_path = '';
alter function public.sync_admin_user_profile_from_auth() set search_path = '';
alter function public.attach_session_trial_claim() set search_path = '';
alter function public.get_private_admin_overview() set search_path = '';
alter function public.list_private_admin_users(text, text, text, integer, integer, text) set search_path = '';
alter function public.list_private_admin_users_v2(text, text, text, integer, integer, text) set search_path = '';
