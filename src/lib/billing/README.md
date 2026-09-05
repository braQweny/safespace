# Abonament Stripe Managed Payments

Integracja jest domyślnie wyłączona. Obsługuje wyłącznie sandbox: jeden abonament
49 zł brutto miesięcznie, bez triala, kuponów i zmiany planu. Aktywacja Managed
Payments i kwalifikacja produktu wymagają potwierdzenia Stripe; brak dostępności
nie przełącza integracji na zwykły Checkout.

## Granice danych i uprawnień

- `POST /api/billing/checkout` i `/portal` ustalają właściciela z sesji,
  wymagają tego samego originu i limitera `BILLING_RATE_LIMITER`.
- `GET /api/billing/status` czyta wyłącznie własny widok `billing_status`
  przez Supabase RLS. DTO nie zawiera identyfikatorów Stripe.
- Webhook sprawdza podpis na surowych bajtach, również przy braku
  `Content-Length`. Limit aktywnego webhooka to 256 KiB. W trybie off endpoint
  zwraca 503 bez odczytu body i bez kontaktu ze Stripe.
- `pg` używa osobnego loginu `safespace_billing_login`, dziedziczącego wyłącznie
  rolę `safespace_billing`. Rola zapisuje dane rozliczeniowe w schemacie
  `private`; nie czyta rozmów, wiadomości, podsumowań ani pamięci awatarów.
  Worker nie otrzymuje klucza `service_role` ani połączenia `postgres`.
- Potwierdzona opłacona faktura wyznacza `paid_until`. Baza oblicza premium
  według swojego czasu, niezależnie od dostarczenia webhooka kończącego okres.
  `premium_granted_at` oznacza wyłącznie niezależne nadanie ręczne.
- Powrót `?checkout=success` uruchamia oczekiwanie na stan zapisany w bazie;
  sam adres nie nadaje dostępu. Próby zakupu i zdarzenia są trwale deduplikowane.
- Usuwanie konta w sandboxie wymaga też limitera. Najpierw blokuje zakupy, zamyka oczekujący Checkout i potwierdza
  anulowanie abonamentu w Stripe. Dopiero potem istniejący RPC usuwa konto.
  Błąd Stripe pozwala ponowić usuwanie. Bezpośredni RPC nie omija tej kolejności.
  Usuwanie konta anuluje od razu; portal anuluje na koniec okresu. Brak zwrotów
  automatycznych.

## Konfiguracja lokalna

Sandbox uruchamiaj przez `npm run dev:billing` z nieśledzonym plikiem
`.dev.vars.billing`. Ten plik pasuje do istniejącej reguły `.dev.vars*` w
`.gitignore`; zawiera lokalne ustawienia Supabase i sekrety testowe Stripe.
Narzędzia Node nadal korzystają z `.env`. Poniższe wartości są placeholderami:

```dotenv
BILLING_MODE=off
STRIPE_SECRET_KEY=sk_test_REPLACE
STRIPE_WEBHOOK_SECRET=whsec_REPLACE
STRIPE_PRICE_ID=price_REPLACE
BILLING_APP_URL=http://127.0.0.1:4321
BILLING_DATABASE_URL=postgresql://safespace_billing_login:REPLACE_URL_ENCODED_PASSWORD@127.0.0.1:54322/postgres
```

W `.dev.vars.billing` ustaw `BILLING_MODE=sandbox` oraz lokalne
`SUPABASE_URL` i `SUPABASE_KEY`. Test pełnej rozmowy wymaga też prawidłowego
`OPENROUTER_API_KEY`. Runner używa wskazanego pliku, bez automatycznego scalania
z `.dev.vars`. Klucze live Stripe są odrzucane.
`BILLING_APP_URL` musi być stałym originem dokładnie zgodnym z adresem otwartym
w przeglądarce: `http://127.0.0.1:4321`; `localhost` jest innym originem.

`scripts/start-billing-sandbox.mjs` uruchamia produkcyjny artefakt lokalnie w
workerd. Tworzy tymczasową konfigurację na podstawie `dist/server/wrangler.json`,
wczytuje jawnie `.dev.vars.billing` i zachowuje binding limitera. Konfiguracja
nie ma ograniczenia `secrets.required`, które w zwykłym uruchomieniu Wranglera
odfiltrowuje opcjonalne klucze billingowe. Po zatrzymaniu runner usuwa tymczasową
konfigurację i stan. Zwykłe `npm run dev` ani preview CI nie zastępują tej
ścieżki weryfikacji sandboxa.

Produkcyjny `wrangler.jsonc` nadal ma `BILLING_MODE=off` i trzy dotychczasowe
wymagane sekrety. Lokalny runner nie zmienia konfiguracji wdrożeniowej.

Przed migracją sprawdź mapowanie portów obu działających stosów Supabase.
Połącz się bezpośrednio z właściwą bazą i porównaj pliki `supabase/migrations`
z `supabase_migrations.schema_migrations`. Nie polegaj wyłącznie na `--local`,
jeśli wskazuje drugi stos. Zastosuj tylko brakujące migracje; ta integracja
dodaje `20260905175333_add_stripe_billing_entitlements.sql`. Następnie ponownie
sprawdź historię i widoki `public.billing_status` oraz `public.account_access`.

Migracja tworzy rolę grupową bez hasła. W potwierdzonej lokalnej bazie utwórz
osobny login jako administrator; hasło nadaj interaktywnie przez `psql`, aby
nie wpisywać go w SQL, historii poleceń ani repozytorium:

```sql
create role safespace_billing_login login inherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant safespace_billing to safespace_billing_login;
grant connect on database postgres to safespace_billing_login;
\password safespace_billing_login
```

Jeżeli login już istnieje, sprawdź jego flagi i członkostwa zamiast tworzyć go
ponownie. Nie nadaj mu innych ról. W URL zakoduj hasło jako komponent URL.
[Zasady ról PostgreSQL w Supabase](https://supabase.com/docs/guides/database/postgres/roles).

Weryfikacja właścicielska bez odczytu prywatnych treści:

```sql
select rolname, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls
from pg_roles where rolname = 'safespace_billing_login';
select pg_has_role('safespace_billing_login', 'safespace_billing', 'member');
select has_table_privilege('safespace_billing_login', 'public.session_messages', 'SELECT');
select has_table_privilege('safespace_billing_login', 'public.session_summaries', 'SELECT');
```

Flagi podwyższonych uprawnień i oba odczyty treści muszą zwracać `false`,
członkostwo w roli billingowej `true`. Testy PostgreSQL dodatkowo wykonują
próby niedozwolonego odczytu i zapisu rzeczywistą rolą.

## Stripe i przekazywanie webhooków

W istniejącym sandboxie dokończ Managed Payments. Utwórz aktywny produkt
„SafeSpace Premium”, kategorię AIaaS do użytku osobistego (`txcd_10105001`) i cenę
4900 jednostek PLN, co miesiąc, `tax_behavior=inclusive`. Backend sprawdza te
właściwości przed zakupem; nie akceptuje ceny podanej przez klienta.
[Dokumentacja Managed Payments](https://docs.stripe.com/payments/managed-payments/set-up).

Zbuduj aplikację z lokalnym `SUPABASE_URL` dostępnym podczas builda, a następnie
uruchom runner sandboxowy. W drugim terminalu włącz Stripe CLI zalogowane
do tego samego sandboxa:

```sh
npm run build
npm run dev:billing
# W drugim terminalu:
stripe listen --forward-to http://127.0.0.1:4321/api/billing/webhook
```

Sekret podany przez `stripe listen` zapisz w `.dev.vars.billing` jako
`STRIPE_WEBHOOK_SECRET` i uruchom `npm run dev:billing` ponownie. Zmiana samego
sekretu nie wymaga ponownego builda; zmiana kodu wymaga `npm run build`.
Nie kopiuj sekretu do dokumentacji ani logów zadania.
Portal tworzony przez backend pozwala zmienić metodę płatności, czytać dokumenty
i anulować odnowienie na koniec okresu; zmiana planu jest wyłączona.

## Weryfikacja lokalna

CI nie potrzebuje sekretów Stripe. `npm run test` obejmuje podpisy, błędne
payloady, idempotencję i stan interfejsu; `npm run test:db` sprawdza migracje,
RLS, uprawnienia roli, czas bazy, równoległy zakup i usunięcie konta.
`tests/e2e/billing-off.spec.ts` obejmuje wyłącznie anonimowy przepływ przy
wyłączonych płatnościach. To nie jest dowód poprawnego zakupu.

Uruchom pojedynczy smoke na produkcyjnym buildzie:

```sh
SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-public-key npm run build
npm run test:e2e -- tests/e2e/billing-off.spec.ts
```

Wyniki z 2026-09-05 dotyczą lokalnego Workera i rzeczywistego sandboxa Stripe.
Nie stanowią potwierdzenia wdrożenia produkcyjnego. Szczegóły i ograniczenie
zewnętrznego formularza opisuje [raport weryfikacji](../../../tests/billing-sandbox/verification-2026-09-05.md).

| Ryzyko                    | Wynik                                                                             | Rodzaj dowodu                                          |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Zakup po trzech rozmowach | Płatność potwierdzona, czwarta rozmowa 3600 s, premium po wylogowaniu i logowaniu | Rzeczywisty Checkout, CUA, webhook, lokalny PostgreSQL |
| Odrzucona płatność        | Karta testowa odrzucona, brak płatnego premium, ponowienie udane                  | Rzeczywisty Checkout i DB                              |
| Udane odnowienie          | Kolejna faktura 4900 PLN opłacona, `paid_until` przedłużony                       | Test Clock i webhook                                   |
| Anulowanie                | Portal ustawił termin anulowania; opłacony dostęp pozostał                        | Rzeczywisty Portal i DB                                |
| Nieudane odnowienie       | `past_due`, faktura nieopłacona, `paid_until` bez przedłużenia                    | Test Clock, zmiana karty w Portalu, webhook            |
| Wygaśnięcie w aplikacji   | Czas DB odbiera paid premium bez webhooka, rozpoczęta rozmowa zachowuje czas      | Testy rzeczywistego PostgreSQL                         |
| Usunięcie konta           | Aktywny abonament anulowany, Auth i dane usunięte; brak kolejnej faktury          | CUA, Stripe API i Test Clock po następnym terminie     |
| Awaria przy usuwaniu      | Konto i blokada zakupów pozostają, ponowienie rozstrzyga anulowanie               | Testy jednostkowe i PostgreSQL                         |
| Konto zablokowane         | Portal i usuwanie dostępne; nowy zakup zabroniony                                 | CUA, testy endpointów i PostgreSQL                     |
| Ręczne premium            | Niezależne od anulowania i wygaśnięcia płatnego dostępu                           | Testy PostgreSQL i panelu administratora               |

Automatyczny test prawdziwego zakupu jest opt-in, poza CI:
[instrukcja](../../../tests/billing-sandbox/README.md). Nie przeszedł hostowanego
formularza Stripe podczas tego uruchomienia; potwierdzenie zakupu pochodzi z
osobnego przejścia CUA. Smoke CI przy `BILLING_MODE=off` jest niezależnym testem.

[Test Clocks Stripe](https://docs.stripe.com/billing/testing/test-clocks) przesuwają
czas obiektów Stripe, nie zegar PostgreSQL ani przeglądarki. Wynik odnowienia
i wygaśnięcie według czasu aplikacji trzeba sprawdzać oddzielnie. Po zakończeniu
zatrzymaj CLI i serwery uruchomione tylko na potrzeby weryfikacji.

## Nierozstrzygnięta próba Checkout

Zapisana próba zakupu zachowuje stały klucz idempotencji i identyczne parametry.
Odzyskiwanie korzysta z ID sesji lub losowego `client_reference_id` własnego klienta.
Znany otwarty Checkout musi zostać wygaszony i ponownie odczytany po ID przed
potwierdzeniem usunięcia konta — brak na liście sesji nie jest potwierdzeniem.

Po 23 godzinach aplikacja nie ponawia tworzenia pod kluczem, który Stripe może
usunąć. Jeśli nie da się odzyskać wyniku, zakup i usuwanie pozostają zablokowane
błędem wymagającym rozstrzygnięcia operacyjnego w Stripe. Nie oznaczaj takiej próby
jako wygasłej tylko dlatego, że lista jest pusta; najpierw trzeba potwierdzić
ostateczny wynik żądania u dostawcy. To celowe ograniczenie chroni przed opóźnionym
utworzeniem drugiego abonamentu lub obciążeniem po usunięciu konta.
