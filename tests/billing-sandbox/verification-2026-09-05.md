# Weryfikacja lokalnego Stripe Managed Payments — 2026-09-05

Zakres: lokalny Worker `127.0.0.1:4321`, Supabase API `54321` / PostgreSQL
`54322`, istniejący sandbox Stripe. Brak publikacji na Cloudflare i rzeczywistych
płatności. Domyślna konfiguracja aplikacji pozostaje `BILLING_MODE=off`.

## Potwierdzone przejście przez przeglądarkę i Stripe

- Managed Payments w panelu sandboxa ma status **Active**. Produkt SafeSpace
  Premium: 49 PLN miesięcznie, podatek w cenie, AIaaS do użytku osobistego.
- Konto syntetyczne wykorzystało trzy rozmowy po 900 sekund. Dashboard odmówił
  rozpoczęcia czwartej i udostępnił zakup.
- Rzeczywisty Checkout odrzucił kartę `4000 0000 0000 0002`. W bazie nadal
  `paid_premium_active=false`, `paid_until=null`.
- Ponowienie tego samego Checkout kartą `4242 4242 4242 4242` opłaciło fakturę
  4900 PLN. Webhooki trafiły przez Stripe CLI do lokalnego Workera.
- Odczyt własnego statusu pokazał aktywne premium. Czwarta rozmowa uruchomiona
  przyciskiem aplikacji miała `status=active` i `duration_bucket_seconds=3600`;
  ekran pokazał czas 60 minut. Nie wysyłano treści rozmowy.
- Wylogowanie i ponowne zalogowanie przez formularz zachowało premium.
- Test Clock przesunięty do odnowienia i finalizacji faktury wygenerował kolejną
  płatność 4900 PLN. `paid_until` wydłużył się z 5 października do 5 listopada.
- W prawdziwym Customer Portal zmieniono metodę abonamentu na kartę `0341`.
  Następne odnowienie zakończyło się `past_due`, fakturą `open` i kwotą zapłaconą
  zero. `paid_until` pozostał 5 listopada; aplikacja pokazała błąd odnowienia.
- Portal anulował kolejne odnowienie. Stripe zapisał termin `cancel_at`, a
  aplikacja pokazała anulowanie i zachowała wyłącznie opłacony dostęp.
- Zablokowanie syntetycznego konta pozostawiło dostęp do zarządzania i usuwania.
  Zakup nie był dostępny. Portal nadal otwierał się przez endpoint aplikacji.
- Zmiana karty na `4242` i zapłata w portalu odzyskały zaległą płatność; Stripe
  ponownie pokazał `active` przed usunięciem konta.
- Potwierdzenie `DELETE` w aplikacji anulowało abonament natychmiast. Następnie
  sprawdzono `Stripe status=canceled`, brak użytkownika Auth i brak jego wiersza
  billingowego. Przeglądarka została wylogowana z komunikatem usunięcia.
- Test Clock przesunięty poza następny termin rozliczenia: nadal `canceled`,
  zero nowych faktur. Własny Test Clock, klient i lokalne konto zostały posprzątane.

Próby na rzeczywistym API wykryły i pozwoliły poprawić dwa szczegóły wersji
`2026-08-26.dahlia`: pozycja faktury wskazuje abonament przez
`parent.subscription_item_details.subscription`, a portal może ustawiać
`cancel_at` przy `cancel_at_period_end=false`. Oba przypadki mają regresje.
Nie inferujemy płatności ze statusu abonamentu ani z adresu powrotnego Checkout.

## Kontrole automatyczne

| Kontrola                                           | Wynik                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Vitest                                             | 1180/1180                                                                       |
| PostgreSQL, migracje/RLS/uprawnienia/współbieżność | 41/41                                                                           |
| Chromium na produkcyjnym buildzie, billing off     | 4/4                                                                             |
| TypeScript i ESLint                                | Bez błędów                                                                      |
| Astro check                                        | 0 błędów i ostrzeżeń; 6 istniejących podpowiedzi deprecacji konfiguracji ESLint |
| Build SSR Cloudflare                               | Przeszedł z konfiguracją testową                                                |
| Audyt zależności produkcyjnych                     | 0 podatności                                                                    |

Kontrole PostgreSQL obejmują faktyczny upływ czasu bazy bez webhooka, zachowanie
czasu rozpoczętej rozmowy, niezależność ręcznego premium, obce identyfikatory,
równoległe zakupy oraz niemożność ominięcia anulowania bezpośrednim RPC usuwania.
Testy serwisu sprawdzają deduplikację, stare zdarzenia i awarie Stripe przy usuwaniu.
Znany otwarty Checkout musi zostać wygaszony i potwierdzony po ID, nawet jeśli
późniejsza lista sesji go nie zawiera.

Smoke `billing-off.spec.ts` sprawdzono też celowo wprowadzonym błędem: endpoint
statusu zwracał anonimowemu użytkownikowi HTTP 200 zamiast 401. Test zawiódł na tej
asercji. Przywrócono kod, wykonano nowy build i zaliczono pełne 4 testy E2E.

## Granice dowodu i porządek po testach

Automatyczny test prawdziwego zakupu Playwright **nie przeszedł** hostowanego
formularza Stripe. Nie otrzymał wyniku płatności; nie ustalono jednoznacznie
przyczyny. Nie omijano weryfikacji dostawcy. Pełny zakup opisany powyżej wykonano
osobno przez CUA. Szczegóły: [instrukcja sandboxa](README.md).

Test Clock przesuwa czas Stripe, nie PostgreSQL. Nieudane odnowienie potwierdzono
w sandboxie, a wygaśnięcie według zegara aplikacji — osobnym testem prawdziwej bazy.
Nie wywoływano rzeczywistej awarii sieci podczas usuwania konta; jej obsługę
potwierdzają testy serwisu i bazy.

Właściwa lokalna baza ma 17/17 migracji. Drugi stos Supabase nie został zmieniony.
Worker używa wyłącznie ograniczonego loginu billingowego; nie otrzymał klucza
Supabase `service_role`. Sekrety pozostały w ignorowanym `.dev.vars.billing`
z uprawnieniami `0600`; kontrola plików repozytorium nie wykryła ich treści.
Serwer sandboxa, Stripe CLI i serwery smoke zostały zatrzymane.

Nierozstrzygnięty wynik tworzenia Checkout starszy niż 23 godziny wymaga
potwierdzenia operacyjnego u dostawcy, jeśli nie można odzyskać sesji. Aplikacja
wtedy blokuje zakup i usuwanie zamiast ryzykować drugi abonament. Opis:
[granica odzyskiwania](../../src/lib/billing/README.md#nierozstrzygnięta-próba-checkout).
