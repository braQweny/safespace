# Session data boundary

F-01 tworzy prywatna granice danych sesji. Kod przyszlych slice'ow S-04, S-05, S-06 i S-07 ma uzywac tego katalogu zamiast bezposrednich zapytan `.from(...)` do tabel prywatnych.

## Zasady uzycia

- Kazdy przyszly handler `/api/session`, `/api/chat` albo historii najpierw wywoluje `getSessionDataContext(context)`.
- Handler nie wymaga `user.email`, provider tokenow ani service-role secretow. Przekazuje standardowy Astro context; cookies sa uzywane tylko przez SSR `createClient`, a publiczny kontrakt helpera opiera sie na `context.locals.user.id`.
- Start darmowej sesji musi przejsc przez helper limitu/claimu z F-01, zanim powstanie zwykla sesja rozmowy.
- Wiadomosci sa dopisywane przez repository helpery. Nie tworz nowych direct insertow do `session_messages`.
- Podsumowania widoczne dla uzytkownika sa tworzone przez summary helpery. Nie laduj nieograniczonej historii raw messages jako kontekstu kolejnej sesji.
- Usuwanie sesji ma przechodzic przez deletion helper z Fazy 3, ktory zostawia minimalny tombstone sesji i usuwa prywatne wiadomosci oraz podsumowania.
- Nie loguj raw `content`, `summaryText`, promptow, provider payloadow ani tekstu wypowiedzi uzytkownika/asystenta.
- Nie dodawaj admin-readable helperow ani widokow z trescia rozmow w F-01.

## Typy domenowe teraz

Ten katalog uzywa recznie utrzymywanych typow domenowych w `types.ts`. To celowe: F-01 ma byc mozliwe do wdrozenia bez lokalnego lub hostowanego typegen Supabase.

Typy domenowe sa kontraktem prywatnosci, nie tylko odbiciem tabel. Oddzielaja:

- `SessionMetadata` od prywatnych rekordow contentu.
- `SessionMessageRecord` i `SessionSummaryRecord`, ktore zawieraja tresc prywatna.
- `DeletedSessionTombstone`, ktory nie zawiera `content`, `summaryText`, tytulu, podgladu, promptu, provider payloadu, `modalityId` ani `avatarId`.

## Typegen handoff

Gdy lokalny lub hostowany Supabase bedzie dostepny, dodaj wygenerowane typy `Database` osobnym krokiem. Oczekiwany kierunek:

```bash
npx supabase gen types typescript --local > src/lib/supabase-database.types.ts
```

albo dla hostowanego projektu:

```bash
npx supabase gen types typescript --project-id "$SUPABASE_PROJECT_REF" > src/lib/supabase-database.types.ts
```

Wygenerowane typy maja wzmacniac ten boundary, nie zastepowac go. Publiczne route handlery dalej powinny zwracac typy domenowe i stabilne kody bledow, a nie raw Supabase rows.

## Stabilne bledy

Helpery zwracaja `SessionDataResult<T>` i `SessionDataErrorCode`. Nie przekazuj raw Supabase `message`, `details` ani `hint` do UI, logow lub response body. Dla konfliktu darmowej sesji uzyj stabilnego kodu `trial_already_claimed`.
