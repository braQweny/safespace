# Session safety boundary

F-02 tworzy server-only granice bezpieczenstwa dla przyszlych rozmow AI. Publicznym punktem wejscia jest `evaluateSessionSafety(input)` z `evaluate-session-safety.ts`.

## Zasady uzycia dla S-04

- Kazdy przyszly handler wiadomosci sesji musi wywolac `evaluateSessionSafety()` przed zwykla generacja modelu AI.
- Handler musi rozgalezic przeplyw po `decision.action`, a nie po wlasnych slowach kluczowych albo po odpowiedzi zwyklego modelu.
- `allow` jest jedyna sciezka zwyklej symulacji.
- `allow_with_constraints` moze kontynuowac tylko z ograniczeniami z `decision.constraints`; nie zwraca widocznej kopii ostrzegawczej do UI.
- `hard_stop` blokuje zwykla symulacje. UI ma pokazac `decision.copy` i, gdy sa obecne, `decision.crisisResources`.
- Brak konfiguracji OpenRouter, blad sieci, timeout albo niepoprawna odpowiedz providera sa traktowane jak `hard_stop`.
- Nie loguj prywatnego tekstu uzytkownika, promptow, payloadow providera ani tresci odpowiedzi klasyfikatora.

## Zakres F-02

Ten katalog nie dodaje chat UI, timera, tras `/api/session` ani `/api/chat`, streamingu, historii sesji ani persystencji decyzji bezpieczenstwa. S-04 uzywa tej granicy razem z prywatna granica danych z F-01, ale nie moze jej omijac przed zwykla generacja AI.

## Kontrakt decyzji

- `normal` zwraca `allow`, bez copy alarmowego i bez zasobow kryzysowych.
- `caution` zwraca `allow_with_constraints`, z ograniczeniami przeciw diagnozie, ryzykownym instrukcjom i preskrypcyjnym twierdzeniom terapeutycznym, ale bez komunikatu kryzysowego dla uzytkownika.
- `crisis` zwraca `hard_stop`, zatrzymuje zwykla symulacje i udostepnia zasoby dla Polski, Stanow Zjednoczonych oraz lokalny fallback.
- Fail-closed rowniez zwraca `hard_stop`, ale z kopia o niedostepnej granicy bezpieczenstwa zamiast komunikatu sugerujacego rozpoznanie ryzyka.

## Handoff dla F-03

F-03 udostepnia sesyjne zdarzenia operacyjne w `../operational-visibility/session-events.ts`. S-04 loguje wynik `evaluateSessionSafety()` przez te helpery, uzywajac tylko `riskState`, `action`, `reasonCode`, `durationMs`, `requestId` i opcjonalnego `userHash`.

Nie przekazuj do logow operacyjnych tekstu uzytkownika, promptow, payloadow providera, tresci decyzji klasyfikatora, kopii kryzysowej ani danych wyboru nurtu lub avatara.

Historia sesji, podsumowania i admin-facing operacje prywatnych danych pozostaja poza S-04 i wymagaja osobnych planow S-05, S-06 i S-07.
