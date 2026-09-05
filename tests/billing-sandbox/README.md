# Prawdziwy sandbox płatności

Ten zestaw jest oddzielony od `npm run test:e2e` i CI. Wymaga działającego lokalnego
Workera z billingiem sandbox oraz `stripe listen` przekazującego zdarzenia do niego.
Nie uruchamia ani nie zatrzymuje tych procesów. Używa wyłącznie lokalnego Supabase
na portach API `54321` i PostgreSQL `54322`.

```sh
BILLING_E2E=1 \
BILLING_E2E_AGENT_INSTRUCTIONS_ACK=1 \
BILLING_E2E_DATABASE_URL='postgresql://postgres:LOCAL_PASSWORD@127.0.0.1:54322/postgres' \
npx playwright test --config=playwright.billing.config.ts
```

Konfigurację Workera czyta z lokalnego `.dev.vars.billing`; można wskazać inny plik
przez `BILLING_E2E_ENV_FILE`. Potrzebne są `BILLING_MODE=sandbox`, `BILLING_APP_URL`,
`SUPABASE_URL`, anonimowy `SUPABASE_KEY` i testowy `STRIPE_SECRET_KEY`. Worker ponadto
wymaga swoich ustawień ceny, webhooka i ograniczonej roli billingowej DB. Hasło
`BILLING_E2E_DATABASE_URL` służy wyłącznie lokalnemu procesowi testu, nie Workerowi.

Managed Checkout ma osobne pola ujawnienia automatyzacji. Test zaznacza je jawnie.
Przed ustawieniem `BILLING_E2E_AGENT_INSTRUCTIONS_ACK=1` zapoznaj się z aktualnymi
instrukcjami Stripe po zaznaczeniu „I am an AI agent acting on behalf of someone
else” i wykonaj wymagane kroki. Podczas tej weryfikacji obejmowały sprawdzenie
`command -v link-cli` i przedstawienie użytkownikowi opcji Link CLI, gdy nie był
zainstalowany. Flaga potwierdza wykonanie tych kroków; test sam tego nie zakłada.

Fixture tworzy własne konto przez Auth, ustawia jego cookies przez `storageState`,
przygotowuje trzy wygasłe rozmowy bez treści i tworzy klienta z Test Clock. Każdy
test ma unikalny identyfikator. Blok `finally` sprząta tylko obiekty tego testu,
również gdy asercja zawiedzie. Sekrety, hasła i cookies nie są zapisywane w trace.

Test zakupu odrzuca kartę `4000 0000 0000 0002`, następnie używa `4242 4242 4242 4242`
i sprawdza premium, prawdziwy start czwartej rozmowy na godzinę oraz ponowne
logowanie. Start może wywołać skonfigurowany OpenRouter. Dane kart są wyłącznie
[oficjalnymi danymi testowymi Stripe](https://docs.stripe.com/testing).

`advanceClock()` udostępnia pomocnik do niezależnych scenariuszy odnowienia. Zegar
Stripe nie przesuwa zegara PostgreSQL: wygaśnięcie lokalnego uprawnienia wymaga
osobnej kontroli czasu bazy. Test zakupu nie zastępuje scenariuszy anulowania,
nieudanego odnowienia i usunięcia konta z aktywnym abonamentem.

Stosuj `getByRole`/`getByLabel`/`getByText`, oczekiwanie na konkretny stan oraz własne
przygotowanie i cleanup. Nie stosuj CSS/XPath, `waitForTimeout` ani współdzielonych
klientów Stripe. Selectory hostowanego Checkout wymagają potwierdzenia na jego
rzeczywistym drzewie dostępności; same kontrole statyczne nie oznaczają E2E green.

## Ograniczenie zweryfikowane 2026-09-05

Automatyczny przebieg Playwright **nie przeszedł** całej ścieżki. Utworzył odizolowane
konto i potwierdził blokadę czwartej rozmowy, ale hostowany Checkout po wysłaniu
formularza nie pokazał oczekiwanego wyniku płatności. Oba pola ujawnienia AI były
zaznaczone klawiaturą, a pola formularza nie zgłaszały błędów walidacji. Wystąpiło
żądanie hCaptcha; sama jego obecność nie dowodzi przyczyny zatrzymania.

Nie omijamy weryfikacji Stripe ani CAPTCHA. Jeżeli dostawca wymaga interakcji
człowieka, należy wykonać ręczną weryfikację w przeglądarce. Brak oczekiwanego wyniku
kończy ten test błędem, bez `skip`, zastępowania płatności mockiem czy osłabiania
asercji. Wszystkie własne fixture z wykonanych prób zostały posprzątane. Wyniki
rzeczywistych przejść CUA są raportowane osobno i nie stanowią wyniku green tego
automatycznego testu.
