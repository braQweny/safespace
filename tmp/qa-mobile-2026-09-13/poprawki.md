# Poprawki po teście mobilnym — 13 września 2026

Naprawiono cztery problemy z [pierwotnego audytu](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/raport.md) i dodatkowe przesunięcie całej rozmowy przez fokus na niskim ekranie. Zmiany są lokalne, bez commita i wdrożenia.

## Wynik ponownego sprawdzenia

| Obszar | Poprawka i potwierdzenie |
| --- | --- |
| Strona główna, 320 × 568, PL/EN | Jawna pojedyncza kolumna i możliwość zwężenia podglądu rozmowy. Nagłówek i podgląd mieszczą się w x=16–289 przy szerokości dokumentu 305 px. Nowy test E2E sprawdza również opis i oba przyciski konta. |
| Menu konta, 844 × 390 | Własne przewijanie i limit wysokości. Panel kończy się na y=372; po przewinięciu przycisk wylogowania zajmuje y=319–363. Przewija się menu, a strona pozostaje na `scrollY=0`. Przycisk ma 44 px wysokości. |
| Menu konta, 320 × 568 | Panel mieści się w x=17–289. |
| Aktywna rozmowa, 320 i 360 px | Pełne imię, licznik pod nim, dostępne „Pomoc” i „Zakończ”. Nagłówek ma około 66 px wysokości. Powrót, pomoc i zakończenie zachowują wysokość 44 px. |
| Nagłówek, 640/768/844/1440 px | Zwarty układ trwa do 767 px. Przy 768 px pojawia się pełny nagłówek z licznikiem obok nazwy. Sprawdzono przejście między wariantami i desktop. |
| Dialog zakończenia, 320 × 320 | Mieści się w y=69–300. Otwarcie, Escape i zakończenie nie przesuwają ramki rozmowy. Escape wraca fokusem do „Zakończ”. |
| Pomoc, 320 × 320 i 844 × 390 | Panel mieści się w ekranie i ma własne przewijanie. Powrót fokusu nie przesuwa całej rozmowy. |
| Zakończona rozmowa, 320 × 320 i 320 × 568 | Imię i stan są widoczne. Nagłówek pozostaje na y=0; zawartość ma osobne przewijanie. |
| Minuty głosowe | Karta pokazuje „Do 57 min rozmowy” i „Zostało 57 minut…”. Niepełne minuty są zaokrąglane w dół w obu opisach. |

Dodatkowy błąd ujawnił się przy potwierdzaniu zakończenia na małym ekranie: `main` z `overflow-hidden` miał `scrollTop=44`, mimo że cały dokument miał `scrollY=0`. Nagłówek lądował nad ekranem. `overflow-clip` blokuje przewijanie zewnętrznej ramki także przez fokus; zarządzanie fokusem używa teraz `preventScroll`. Po poprawce odtworzono otwarcie dialogu, anulowanie i zakończenie: nagłówek pozostał na y=0, a `main.scrollTop` wynosił 0.

## Weryfikacja automatyczna

- Vitest: **182 pliki, 1709 testów — wszystkie przeszły**.
- Produkcyjny build SSR i Playwright: **6 testów E2E — wszystkie przeszły**.
- Nowy `landing-mobile.spec.ts`: prawdziwy SSR/CSS, PL i EN, bez logowania i atrap API. Sprawdza geometrię zawartości zamiast samego `scrollWidth` dokumentu.
- Kontrola skuteczności testu: tymczasowe cofnięcie obu zmian układu strony głównej spowodowało błąd testu geometrii. Przywrócono poprawkę; końcowy build i cały zestaw E2E przeszły.
- Testy budżetu i karty startowej obejmują niepełne 57 minut i 40 sekund. Testy treści nagłówka zachowują kontrolę krótkich i pełnych etykiet bez narzucania konkretnej klasy breakpointu.
- TypeScript, lint zmienionych plików, formatowanie i `git diff --check`: bez błędów. Astro check: bez błędów; istniejące wskazówki o przestarzałej konfiguracji ESLint.

Zestaw E2E używa izolowanego podglądu i zastępczej konfiguracji Supabase. Nie dowodzi poprawnego logowania, działania modelu, rozliczeń ani produkcji. Menu i zalogowaną rozmowę sprawdzono osobno na działającym serwerze deweloperskim.

## Stan środowiska i ograniczenia

- Przywrócono serwer deweloperski na `http://localhost:4321/` po konflikcie pamięci Vite wywołanym przełączaniem build/dev. Dodatkowy podgląd E2E został zamknięty przez test runner.
- Przywrócono zwykły rozmiar przeglądarek i zamknięto karty weryfikacyjne.
- W tej rundzie poprawek uruchomiono i zakończono dwie krótkie rozmowy pisane do kontroli nagłówka i fokusu. Pozostały w historii; zawierają tylko powitania awatara. Nie wysyłano wiadomości użytkownika, nie uruchamiano mikrofonu ani podsumowań.
- Sprawdzano rozmiary okna w desktopowym Chromium. Prawdziwa klawiatura telefonu, Safari/iOS, dotyk i systemowe powiększenie tekstu nadal wymagają testu na urządzeniu.

## Zrzuty po poprawkach

![Menu w poziomie po przewinięciu do wylogowania](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/07-menu-poprawione.png)

![Strona główna przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/08-landing-320-poprawione.png)

![Aktywna rozmowa przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/09-czat-320-poprawiony.png)

![Zakończona rozmowa przy 320 px](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/10-czat-zakonczony-320.png)

![Rozmowa na desktopie](/Users/pformela/projects/safespace/tmp/qa-mobile-2026-09-13/11-czat-desktop-poprawiony.png)
