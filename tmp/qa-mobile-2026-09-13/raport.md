# Test interfejsu SafeSpace — 13 września 2026

**Aktualizacja:** problemy opisane poniżej zostały naprawione w kolejnej rundzie. [Wyniki weryfikacji i zrzuty po poprawkach](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/poprawki.md).

Test wykonano na działającym serwerze deweloperskim `http://localhost:4321/`, na bieżącym katalogu roboczym z niezatwierdzonymi zmianami. HEAD podczas testu: `3fcbd96`. Nie zmieniano kodu aplikacji ani nie uruchamiano produkcyjnego builda.

**Wynik: dwa błędy układu do poprawy i dwie drobniejsze niespójności.** Podstawowe ścieżki panelu, pamięci, historii, pisania i kończenia rozmowy oraz walidacji formularzy działały w sprawdzonych wariantach.

## Potwierdzone problemy

### P2 — obcinanie strony głównej przy szerokości 320 px

- Odtworzenie: otworzyć `/` bez logowania, ustawić 320 × 568 px, sprawdzić wersję polską i angielską.
- Wynik: nagłówek, opis i przyciski pierwszej sekcji wychodzą za prawą krawędź. Nie można odsłonić brakującej części przewijaniem w bok.
- Dowód: w wersji polskiej prawa krawędź elementów sekcji dochodziła do x=344 px. Obszar dokumentu miał szerokość 305 px przy oknie 320 px; pozostałe 15 px zajmował pasek przewijania. Nawet bez tego paska elementy przekraczały szerokość okna o 24 px. W wersji angielskiej prawa krawędź dochodziła do x=325 px.
- Samo porównanie `scrollWidth` i `clientWidth` nie wykrywa tego błędu: oba wynosiły 305 px, ponieważ rodzic obcina zawartość.
- Przy 360 × 800 px nie wykryto tego przepełnienia.
- Miejsce do sprawdzenia: [Welcome.astro](/Users/pformela/projects/safespace/src/components/Welcome.astro:59). Pierwsza sekcja używa siatki z automatyczną szerokością kolumny na mobile i `overflow-x-hidden`; podgląd rozmowy może narzucać minimalną szerokość kolumny. To wskazanie przyczyny na podstawie kodu, bez wdrożonej poprawki.
- Sugerowana poprawka: jawna pojedyncza kolumna `minmax(0, 1fr)` i ograniczenie minimalnej szerokości podglądu, potem ponowny test obu języków przy 320 px.

![Obcięta strona główna przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/05-landing-320-pl.png)

### P2 — dół menu konta poza ekranem w poziomie

- Odtworzenie: zalogowany `/dashboard`, okno 844 × 390 px, otworzyć „Konto”.
- Wynik: dół menu, w tym część przycisku wylogowania, wychodzi za ekran. Próba przewinięcia nad menu przewija stronę pod nim i nie odsłania jego dołu.
- Dowód: panel zajmował y=62–414 px; przycisk wylogowania y=369–405 px przy wysokości okna 390 px. Po przewinięciu dokumentu o 390 px położenie przycisku pozostało takie samo. Panel ma `overflow-y: visible`.
- Miejsce: [AppHeader.astro](/Users/pformela/projects/safespace/src/components/AppHeader.astro:73).
- Sugerowana poprawka: maksymalna wysokość zależna od dostępnego viewportu oraz własne przewijanie menu. Sprawdzić także niższe ekrany poziome.

![Menu konta wychodzące za dół ekranu](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/01-menu-landscape.png)

### P3 — imię awatara zanika w nagłówku rozmowy

- Odtworzenie: aktywna rozmowa pisana, 360 × 600 px i 320 × 568 px.
- Wynik: przy 360 px „Lena” skraca się do „L…”, a przy 320 px nie widać imienia. Zegar, pomoc i zakończenie zajmują dostępną przestrzeń.
- Wpływ: gorsza orientacja w rozmowie, bez blokowania podstawowych czynności. Imię nadal występuje przy wypowiedzi i w drzewie dostępności.
- Dowód: przy 360 px szerokość nagłówka z imieniem wynosiła około 27 px. Przy 320 px nie miał dodatniej widocznej szerokości.
- Miejsce: [SessionScreenHeader.tsx](/Users/pformela/projects/safespace/src/components/session/SessionScreenHeader.tsx:114), zwłaszcza podział przestrzeni między część elastyczną a kontrolki z `shrink-0`.
- Sugerowana poprawka: zarezerwować miejsce na krótkie imię albo świadomie rozłożyć nagłówek na dwa rzędy przy najmniejszych szerokościach.

### P3 — różne zaokrąglanie pozostałych minut głosowych

- Odtworzenie: panel konta premium z niepełną liczbą pozostałych minut, wybrać „Głosowa”.
- Wynik w badanym stanie: „Do 58 min rozmowy” oraz „Zostało 57 minut z 120 minut głosowych w tym miesiącu”.
- Wpływ: sprzecznie wyglądające informacje obok siebie; nie stwierdzono na tej podstawie błędu naliczania czasu.
- Przyczyna w kodzie: [session-budget.ts](/Users/pformela/projects/safespace/src/lib/session-flow/session-budget.ts:63) używa `Math.round`, natomiast [plan-copy.ts](/Users/pformela/projects/safespace/src/lib/session-flow/plan-copy.ts:100) używa `Math.floor`.
- Sugerowana poprawka: jedna zasada wyświetlania czasu albo jawne oznaczenie przybliżenia.

## Wykonane scenariusze

| Obszar | Rozmiary / stan | Wynik |
| --- | --- | --- |
| Panel | 390 × 844, 320 × 568, 1440 × 900 | Brak poziomego przepełnienia; desktop ma czytelne dwie kolumny |
| Menu konta | 390 × 844, 844 × 390 | Otwarcie działa; błąd dołu menu w poziomie |
| Pamięć: lista i mapa | 360 × 600 | Przełączanie działa, brak poziomego przepełnienia dokumentu i mapy |
| Karta tematu i edycja | 360 × 600, 320 × 568 | Dialog mieści się, ma własne przewijanie; Escape przywraca fokus do tematu; bez zapisywania zmian |
| Karta osoby | 320 × 568 | Otwiera się; treść i akcje dostępne w przewijanym dialogu |
| Historia | 320 × 568 | Podgląd się otwiera i mieści w oknie; Escape zamyka |
| Aktywna rozmowa | 360 × 600, 360 × 320, 320 × 568, 390 × 844 | Pole tekstu i wysyłanie mieszczą się; po zmniejszeniu wysokości zapis ma własne przewijanie; problem imienia w nagłówku |
| Podpowiedź startowa | aktywna rozmowa | Kliknięcie wstawia tekst do pola; tekst można usunąć; puste pole wyłącza „Wyślij” |
| Potwierdzenie końca rozmowy | 320 × 320 | Cały panel mieści się; anulowanie wraca do rozmowy, potwierdzenie kończy sesję |
| Zakończona rozmowa | 320 × 568, 320 × 320 | Dokument nie rośnie ponad wysokość ekranu; zawartość ma przewijaną kolumnę |
| Pomoc w rozmowie | 320 × 568, 844 × 390 | Osobne przewijanie; panel w poziomie ma 294 px wysokości, 911 px treści; Escape zamyka |
| Wybór pisana/głosowa | 360 × 600 | Przełącza opis i akcję; niespójność 58/57 minut |
| Ustawienia konta | 390 × 844 | Formularz i ustawienia pamięci mieszczą się; nie zmieniano hasła ani ustawień prywatności |
| Abonament | 390 × 844 | Widok mieści się; pokazuje niedostępny zakup; nie wykonywano transakcji |
| Wybór perspektywy | 390 × 844 | Zaznaczenie innej opcji pokazuje „Tylko zapisz” i „Zacznij rozmowę”; nie zapisano zmiany |
| Landing | 320 × 568 PL/EN, 360 × 800 PL | Obcinanie przy 320 px, brak wykrytego przepełnienia przy 360 px |
| Logowanie | 320 × 568 | Pusty formularz pokazuje błędy i przenosi fokus do e-maila; pokazanie hasła działa |
| Język | logowanie EN → PL | Przełączenie renderuje polski formularz; polski pozostaje po przejściu na landing |
| Rejestracja | 360 × 800 | Puste pola i różne hasła dają właściwe komunikaty; fokus trafia do pierwszego błędu; nie utworzono konta |

Historia używa opóźnionej hydratacji: po przewinięciu do sekcji przyciski stają się aktywne. Próba automatycznego kliknięcia elementu jeszcze poza ekranem początkowo trafiała na przycisk wyłączony; po rzeczywistym przewinięciu ścieżka działała. Nie klasyfikuję tego jako błędu aplikacji.

## Granice dowodu i stan po teście

- To przeglądarkowy test rozmiarów ekranu na komputerze, nie test fizycznego telefonu. Nie emulowano w pełni dotyku, mobilnego User-Agent ani klawiatury ekranowej. Pasek przewijania desktopowego Chromium czasami odejmował 15 px od szerokości dokumentu; pomiary podają ten szczegół.
- Nie potwierdzono Safari/iOS, Samsung Internet, WebView, wycięć ekranu ani powiększenia systemowej czcionki. Zmniejszenie wysokości okna nie dowodzi poprawnej obsługi prawdziwej klawiatury.
- Nie sprawdzano mikrofonu, WebRTC, wysłania wiadomości i odpowiedzi modelu na nią, Google OAuth, dostarczenia e-maila, płatności ani usuwania danych.
- Nie uruchamiano CI, pełnego Vitest ani produkcyjnego zestawu Playwright. Sprawdzano rzeczywisty serwer developerski przez UI, DOM i pomiary geometrii.
- Utworzono i zakończono jedną rozmowę pisaną o 18:54, pokazywaną w historii jako 2 minuty. Zawiera powitanie awatara; wpisanego tekstu testowego nie wysłano. Rozmowę pozostawiono w historii. Wybór perspektywy na koncie nadal wskazuje Lenę.
- Chrome DevTools MCP nie mógł otworzyć zajętego profilu. Użyto Chrome przez narzędzie przeglądarkowe, a dla anonimowych formularzy odrębnej przeglądarki w aplikacji. Część wywołań narzędzia wymagała ponowienia po odświeżeniu stanu; końcowe sprawdzenie desktopu wykonano w świeżej karcie.
- Przywrócono normalny rozmiar przeglądarek. Nie uruchamiano dodatkowego serwera; zastany serwer developerski pozostawiono działający.

## Dodatkowe zrzuty

- [Historia przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/02-history-320.png)
- [Czat przy zmniejszonej wysokości](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/03-chat-low-height.png)
- [Czat przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/04-chat-320.png)
- [Panel desktopowy 1440 × 900](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/06-dashboard-desktop.png)
