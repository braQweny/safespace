# SafeSpace — materiały do certyfikacji 10xBuilder

Przygotowano 6 września 2026 dla kodu `282cea1701149bf038630779334f7a6356d5c1a2`.

**Ocena: projekt spełnia sprawdzone wymagania techniczne 10xBuilder.** Ostateczne zaliczenie przyznają prowadzący. Pakiet dotyczy modułów 1–3; nie stanowi zgłoszenia do dodatkowych odznak.

## Formularz i dane

[Otwórz formularz zgłoszeniowy](https://baserow.io/form/g6rJ-njiGpV5lPxvot6iRxsXTh8Wb-AnRjy7s2Zck1c).

| Pole formularza                                         | Co wpisać lub dołączyć                                                                                                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email                                                   | Adres użyty przy zapisie na kurs — uzupełnia uczestnik.                                                                                                                             |
| Imię i nazwisko                                         | Dane do certyfikatu — uzupełnia uczestnik.                                                                                                                                          |
| Typ projektu                                            | Wariant odpowiadający własnemu projektowi; SafeSpace jest autorską aplikacją webową, a nie 10xCards.                                                                                |
| Zgoda na promocję kursu                                 | Wymagany wybór odpowiedzi; decyzja uczestnika. Nie została zaznaczona.                                                                                                              |
| Repozytorium projektu na GitHub                         | `https://github.com/braQweny/safespace`                                                                                                                                             |
| Publiczny adres aplikacji                               | `https://safespace.safespace-ai.workers.dev/`                                                                                                                                       |
| Screenshot: Ekran logowania (opcjonalny)                | [01-logowanie.jpg](./screenshots/01-logowanie.jpg)                                                                                                                                  |
| Screenshot: Strona główna / Ekran po zalogowaniu        | [02-panel-po-zalogowaniu.jpg](./screenshots/02-panel-po-zalogowaniu.jpg)                                                                                                            |
| Screenshot: Główna funkcjonalność nr 1                  | [03-rozmowa-ai.jpg](./screenshots/03-rozmowa-ai.jpg) — wysłanie wiadomości i odpowiedź AI.                                                                                          |
| Screenshot: Główna funkcjonalność nr 2                  | [04-historia-i-podsumowanie.jpg](./screenshots/04-historia-i-podsumowanie.jpg) — trwały zapis i podsumowanie.                                                                       |
| Screenshot: Poprawnie działający test lub zestaw testów | [05-testy-ci.jpg](./screenshots/05-testy-ci.jpg) — rzeczywisty GitHub Actions, 1201 zaliczonych testów.                                                                             |
| Załączniki niestandardowe                               | Opcjonalnie: [wybór perspektywy](./screenshots/06-wybor-perspektywy.jpg), [potwierdzenie usuwania](./screenshots/07-usuwanie-rozmowy.jpg), `test-plan.md`, `ocena-kwalifikacji.md`. |
| Twój komentarz                                          | Wklej zawartość [komentarz-do-formularza.txt](./komentarz-do-formularza.txt).                                                                                                       |

## Przed wysłaniem

1. Zapewnij oceniającym dostęp do kodu. Repozytorium jest prywatne; 6 września odczyt collaboratorów pokazał wyłącznie właściciela, bez zaproszenia dla `przeprogramowani`. Oficjalna instrukcja formularza wskazuje dodanie konta GitHub `przeprogramowani`. Nie zmieniono widoczności repo ani uprawnień.
2. Nowy `context/foundation/test-plan.md` jest przygotowany lokalnie i skopiowany do pakietu. Dołącz kopię jako załącznik lub opublikuj dokument w repozytorium przed wysłaniem — obecny commit na GitHub jeszcze go nie zawiera.
3. Uzupełnij dane uczestnika i decyzję dotyczącą promocji. Sprawdź tekst komentarza.
4. Wyślij formularz do **14 września 2026, godz. 23:59**. Pakiet nie wysyła zgłoszenia. Ewentualne dodatkowe odznaki należy zgłosić w tej samej turze osobnym formularzem.

## Pochodzenie materiałów

- Ekrany aplikacji pochodzą z rzeczywistego lokalnego SafeSpace, Chrome i lokalnego Supabase. Wykorzystano świeże konto demonstracyjne oraz neutralną, jawnie fikcyjną wiadomość o przygotowaniu prezentacji.
- Odpowiedź AI i podsumowanie wygenerowała rzeczywista integracja OpenRouter. Nie wstawiano odpowiedzi ręcznie do DOM ani do bazy. Podsumowanie wygenerowano ponownie, sprawdzając funkcję „Napisz od nowa”.
- Zrzuty nie zawierają rzeczywistych rozmów użytkownika, danych do logowania ani sekretów. Nie są dowodem przejścia całego zalogowanego scenariusza na produkcji.
- Ekran testów pochodzi bezpośrednio z [GitHub Actions](https://github.com/braQweny/safespace/actions/runs/34043737394) dla tego samego commita. Dane demonstracyjne usunięto po sprawdzeniu.
- Pliki `weryfikacja/vitest.txt`, `weryfikacja/postgres.txt` i `weryfikacja/crud-usuwanie.json` zawierają wyniki wykonanych kontroli; `weryfikacja/ci.json` zawiera odczyt statusów CI i wdrożenia.

Źródła kryteriów: [zasady 10xBuilder](https://bravecourses.circle.so/c/informacje-i-ogloszenia-10x3/certyfikacja-10xbuilder-formularz-zgloszeniowy-i-kluczowe-zasady), [pełne wymagania projektu](https://bravecourses.circle.so/c/informacje-i-ogloszenia-10x3/wszystko-o-projekcie-zaliczeniowym-i-certyfikacji-10xdevs-3-0).
