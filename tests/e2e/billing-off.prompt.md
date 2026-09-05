# Ryzyko BILLING-OFF: wejście do płatności omija logowanie lub domyślny tryb off

Źródła: plan Stripe Managed Payments, `src/middleware.ts`,
`src/lib/billing/routes.ts`, `src/pages/account/billing.astro`,
`src/pages/api/billing/webhook.ts`. Wzorzec: `seed.spec.ts` oraz zasady z `README.md`.

Scenariusz: niezalogowany użytkownik otwiera stronę abonamentu z parametrem
`checkout=success`. Trafia na działającą stronę logowania. Bezpośrednie POST-y
Checkout i Portal również prowadzą do logowania, a własny stan abonamentu
pozostaje niedostępny. Wyłączony webhook zwraca 503 przed wywołaniem Stripe.

Prawdziwe granice: build produkcyjny Astro, lokalny workerd, middleware, SSR,
domyślny język i przeglądarka. Brak mocków granic wewnętrznych. Preview ma
jednorazową konfigurację, fikcyjne dane Supabase i domyślny tryb billing off;
nie tworzy kont ani nie wysyła zapytań płatniczych. Test nie dowodzi zakupu,
działania webhooka sandboxowego, RLS ani poprawnego odnowienia.

Rozmiar body webhooka 40 KiB sprawdza właściwe routowanie poza zwykły limit
32 KiB. Limit 256 KiB i strumienie bez Content-Length należą do testów
jednostkowych `src/lib/billing/__tests__/webhook.test.ts`.

Przegląd pięciu antywzorców: asercje sprawdzają odmowę dostępu i rzeczywistą
stronę logowania; locatory używają ról; każdy test ma nowy kontekst; oczekiwania
dotyczą stanu, bez opóźnień; nie powstają dane wymagające usunięcia.

Deliberate-break: do potwierdzenia na osobnym buildzie po tymczasowym usunięciu
ochrony strony abonamentu albo zwróceniu 200 z odczytu własnego stanu bez
logowania. Zmianę produkcyjną trzeba od razu cofnąć i ponownie zbudować.
