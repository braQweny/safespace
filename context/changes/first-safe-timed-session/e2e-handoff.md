# E2E handoff dla S-04

S-04 zostawia testy E2E jako przyszly krok. Aktualna implementacja opiera sie na testach jednostkowych i route-level mocks, bez dodawania Playwright infrastructure.

## Przyszle scenariusze

- Auth/session setup: test powinien tworzyc albo mockowac zalogowanego uzytkownika bez zaleznosci od recznego konta.
- Avatar prerequisite: wejscie na `/dashboard/session` bez zapisanego wyboru avatara nie moze skonsumowac darmowej sesji i ma kierowac do wyboru avatara.
- Conscious start: wejscie na `/dashboard/session` z avatarem pokazuje przygotowanie, a trial jest claimowany dopiero po kliknieciu startu.
- Timer visible: po starcie widac nieintruzywny licznik liczony z server-owned `startedAt` i `expiresAt`.
- Normal message: zwykla wiadomosc pokazuje response-progress state, zwraca niestreamingowa odpowiedz i zostawia widoczne user/assistant messages.
- Caution state: wymuszona albo mockowana decyzja `allow_with_constraints` pokazuje safe-boundary copy i pozwala kontynuowac, dopoki sesja nie wygasla.
- Hard-stop/fail-closed: wymuszona albo mockowana decyzja `hard_stop` lub fail-closed pokazuje bezpieczne zasoby/copy i blokuje zwykla kontynuacje.
- Expiry rejection: po uplywie 15 minut composer jest zablokowany, a bezposredni POST do `/api/session/message` zwraca expired/rejected state.
- No private logs: smoke lub test pomocniczy powinien potwierdzic, ze logi operacyjne nie zawieraja `message`, `prompt`, `content`, generated answer text, summary, raw provider payload, raw Supabase error, `modalityId` ani `avatarId`.

## Ograniczenia obecnego slice'a

- Brak Playwright config, fixtures i browser automation w S-04.
- Brak hostowanej weryfikacji Supabase/OpenRouter/Cloudflare bez owner-owned sekretow i srodowiska.
- Route-level testy endpointow sa mockowane i uruchamiane przez `npm run test`.
- S-05 historia sesji, S-06 podsumowania i S-07 admin aggregates pozostaja osobnymi planami.
