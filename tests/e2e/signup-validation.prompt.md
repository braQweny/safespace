# Ryzyko: fokus po błędzie formularza

Punkt odniesienia: audyt UX z 5 września 2026, formularz `/auth/signup`.
Po wysłaniu pustego formularza fokus pozostawał na przycisku. Użytkownik klawiatury
musiał szukać pola wymagającego poprawy.

Scenariusz: puste zgłoszenie przenosi fokus na e-mail, kolejne na hasło, a różne
hasła na powtórzenie hasła. Edycja innego pola nie może ponownie przejmować fokusu.

Prawdziwe granice: produkcyjny SSR, CSP, hydratacja React, formularz i klawiatura.
Bez mocków. Test używa wyłącznie niepoprawnych danych i nie tworzy konta.
Kontekst przeglądarki, wpisane dane i storage usuwa Playwright.

Wzorzec: `seed.spec.ts` i reguły w `README.md`. Asercja `toBeFocused()` musi upaść
po wyłączeniu przekazywania fokusu w formularzu.
