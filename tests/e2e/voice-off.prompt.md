# Ryzyko VOICE-OFF: wyłączona rozmowa głosowa jest obiecywana na stronie prywatności albo osiągalna bez logowania

Źródła: plan `context/changes/voice-live-conversation/plan.md` (etap 6),
`src/pages/privacy.astro`, `src/lib/page-copy/privacy-copy.ts`,
`src/components/privacy/PrivacyContent{En,Pl}.astro`, `src/middleware.ts`,
`src/pages/api/session/voice/{connect,heartbeat}.ts`, `src/worker.ts`.
Wzorzec: `seed.spec.ts`, `billing-off.spec.ts` oraz zasady z `README.md`.

Scenariusz: niezalogowany użytkownik otwiera stronę prywatności przy
`VOICE_SESSION_MODE=off`. Spis treści i proza nie zawierają sekcji „Voice
conversations”, bo panel nie oferuje rozmowy głosowej. Strona rozmowy odsyła do
logowania. Bezpośrednie żądania JSON do `connect` i `heartbeat` przechodzą
przez prawdziwy middleware (strażnik ciała, limiter per użytkownik, SSR auth) i
zatrzymują się na bramce dostępu trasy: stabilne 401 `missing_auth`, nigdy 404
(trasa zgubiona przez własne entry Workera) ani 500.

Prawdziwe granice: build produkcyjny Astro, lokalny workerd z własnym `main`
(`src/worker.ts` z klasą Durable Object), bindingi limiterów z produkcyjnej
konfiguracji, middleware, SSR, domyślny język i przeglądarka. Brak mocków granic
wewnętrznych. Preview ma jednorazową konfigurację, fikcyjne dane Supabase i flagę
głosową off; nie tworzy kont, nie woła OpenAI i nie uzbraja obserwatora. Test
nie dowodzi połączenia audio, klasyfikacji ani zapisu transkryptu — to
weryfikacja manualna z `verification.md`.

Przegląd pięciu antywzorców: asercje sprawdzają brak obietnicy i odmowę dostępu
na prawdziwej stronie; locatory używają ról i nazw; każdy test ma nowy
kontekst; oczekiwania dotyczą stanu, bez opóźnień; nie powstają dane wymagające
usunięcia.

Deliberate-break: publiczne zmienne `astro:env` są wkompilowywane w build z
`wrangler.jsonc`, więc `vars` podglądu nie zmieniają flagi. Złamanie potwierdzono
2026-09-12 na osobnym buildzie po tymczasowym wymuszeniu `voice: true` w
`src/pages/privacy.astro` i `voiceSession = true` w `PrivacyContentEn.astro`
przy fladze `off` (link i sekcja pojawiają się, test pada); osobny build z
`VOICE_SESSION_MODE: "on"` w `wrangler.jsonc` potwierdził gałąź „włączone”
(spec czyta flagę z tego samego pliku, więc commit przełączający flagę nie
wywraca CI). Zmiany trzeba od razu cofnąć i przebudować.
