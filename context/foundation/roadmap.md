---
project: SafeSpace
version: 1
status: draft
created: 2026-05-31
updated: 2026-05-31
prd_version: 1
main_goal: quality
top_blocker: decisions
---

# Roadmap: SafeSpace

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

SafeSpace pomaga dorosłej osobie rozważającej psychoterapię uporządkować myśli, zobaczyć problem z innej perspektywy i lepiej zrozumieć, jak może wyglądać praca w różnych nurtach terapeutycznych. Produkt ma odróżnić się od generycznych chatbotów przez jasne ramy: symulacja i edukacja, nie zastępstwo specjalisty. Najważniejsza granica jakościowa to prywatność rozmów, brak diagnozy, kontrola sytuacji kryzysowych i brak domyślnego dostępu admina do treści rozmów.

## North star

**S-04: Użytkownik może odbyć pierwszą bezpieczną sesję z widocznym czasem** - Gwiazda przewodnia, czyli najmniejsza pełna ścieżka użytkownika, która pokazuje, czy główna wartość produktu działa, jest tu ustawiona jak najwcześniej, bo dopiero prawdziwa rozmowa z kontem, awatarem, limitem czasu i zapisem historii sprawdza sens SafeSpace.

> W tej roadmapie "North star" oznacza najmniejszy pełny przepływ, którego poprawne działanie pokazuje, że produkt rozwiązuje główny problem z PRD; trafia jak najwcześniej, bo reszta ma sens tylko wtedy, gdy ten przepływ jest bezpieczny i użyteczny.

## At a glance

| ID   | Change ID                           | Outcome (user can ...)                                                                                                                             | Prerequisites                    | PRD refs                                                                    | Status   |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------- | -------- |
| F-01 | private-session-data-boundary       | (foundation) prywatna pamięć sesji, podsumowań, usuwania i limitu darmowej sesji ma minimalny kontrakt bezpieczeństwa                              | -                                | FR-003, FR-006, FR-007, FR-010, Access Control, Non-Functional Requirements | ready    |
| F-02 | safe-ai-session-boundary            | (foundation) rozmowa AI ma minimalną granicę bezpieczeństwa: jasne ograniczenia, przerwanie kryzysu i brak zwykłej symulacji w sytuacji zagrożenia | -                                | FR-005, Non-Functional Requirements, Business Logic                         | ready    |
| F-03 | privacy-safe-operational-visibility | (foundation) błędy i stan krytycznych przepływów można diagnozować bez logowania treści rozmów                                                     | -                                | Non-Functional Requirements, FR-010                                         | ready    |
| S-01 | product-landing-and-limits          | użytkownik może zrozumieć ofertę, darmową sesję i granice produktu przed założeniem konta                                                          | -                                | US-01, FR-001, Non-Functional Requirements                                  | ready    |
| S-02 | required-account-access             | użytkownik może założyć konto albo zalogować się wymaganymi metodami i wejść do prywatnej części produktu                                          | -                                | US-01, FR-002, Access Control                                               | ready    |
| S-03 | modality-avatar-choice              | użytkownik może wybrać awatara reprezentującego nurt psychoterapii i przeczytać krótkie wyjaśnienie nurtu                                          | S-02, external: lista nurtów MVP | US-01, FR-004, Business Logic                                               | blocked  |
| S-04 | first-safe-timed-session            | użytkownik może odbyć pierwszą bezpieczną 15-minutową sesję w przeglądarce z widocznym czasem i sygnałem trwania odpowiedzi                        | F-01, F-02, F-03, S-02, S-03     | US-01, FR-003, FR-005, Non-Functional Requirements                          | blocked  |
| S-05 | session-history-control             | użytkownik może wrócić do historii sesji i usunąć zapis rozmowy                                                                                    | F-01, S-04                       | US-01, FR-006                                                               | proposed |
| S-06 | summary-backed-next-session         | użytkownik może zobaczyć podsumowanie poprzednich rozmów i rozpocząć kolejną sesję z tym kontekstem                                                | F-01, F-02, S-04, S-05           | US-01, FR-007, Business Logic                                               | proposed |
| S-07 | private-admin-operations            | admin może oglądać statystyki i zarządzać użytkownikami bez dostępu do prywatnych treści rozmów                                                    | F-01, F-03, S-04                 | FR-009, FR-010, Access Control                                              | blocked  |

## Streams

Navigation aid - groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                                | Note                                                                                                       |
| ------ | ------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| A      | Wejście i konto    | `S-01` -> `S-02` -> `S-03`           | Najkrótsza droga do świadomego, zalogowanego startu sesji.                                                 |
| B      | Bezpieczna rozmowa | `F-02` / `F-03` -> `S-04`            | Wzmacnia wybrany cel jakościowy: rozmowa nie startuje bez granic bezpieczeństwa i prywatnej diagnostyki.   |
| C      | Prywatna ciągłość  | `F-01` -> `S-05` -> `S-06` -> `S-07` | Dołącza do Stream B po pierwszej sesji, bo historia, podsumowania i admin opierają się na zapisanej sesji. |

## Baseline

What's already in place in the codebase as of `2026-05-31` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present - app shell, routing, UI tooling and interactive auth views are in place.
- **Backend / API:** partial - auth route handlers exist, but session, history, AI and admin endpoints are not yet present.
- **Data:** partial - local Supabase configuration exists, but application tables, migrations and policies are not yet present.
- **Auth:** present - Supabase SSR auth, email/password forms and protected dashboard middleware are in place; social login from PRD is still part of S-02.
- **Deploy / infra:** present - Cloudflare Workers SSR configuration and GitHub Actions CI/deploy are in place.
- **Observability:** partial - platform observability is enabled, but app-level privacy-safe logging and flow health are not yet present.

## Foundations

### F-01: Private session data boundary

- **Outcome:** (foundation) prywatna pamięć sesji, podsumowań, usuwania i limitu darmowej sesji ma minimalny kontrakt bezpieczeństwa.
- **Change ID:** private-session-data-boundary
- **PRD refs:** FR-003, FR-006, FR-007, FR-010, Access Control, Non-Functional Requirements
- **Unlocks:** S-04, S-05, S-06, S-07
- **Prerequisites:** -
- **Parallel with:** F-02, F-03, S-01, S-02
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Jeśli prywatność i własność danych zostaną dodane dopiero przy historii, późniejsze poprawki mogą naruszyć granicę admina i kasowania rozmów.
- **Status:** ready

### F-02: Safe AI session boundary

- **Outcome:** (foundation) rozmowa AI ma minimalną granicę bezpieczeństwa: jasne ograniczenia, przerwanie kryzysu i brak zwykłej symulacji w sytuacji zagrożenia.
- **Change ID:** safe-ai-session-boundary
- **PRD refs:** FR-005, Non-Functional Requirements, Business Logic
- **Unlocks:** S-04, S-06
- **Prerequisites:** -
- **Parallel with:** F-01, F-03, S-01, S-02
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Przy celu jakościowym pierwsza rozmowa bez granicy kryzysowej byłaby technicznie efektowna, ale produktowo zbyt ryzykowna.
- **Status:** ready

### F-03: Privacy-safe operational visibility

- **Outcome:** (foundation) błędy i stan krytycznych przepływów można diagnozować bez logowania treści rozmów.
- **Change ID:** privacy-safe-operational-visibility
- **PRD refs:** Non-Functional Requirements, FR-010
- **Unlocks:** S-04, S-07, named verification path: auth/session/admin flows without private conversation logs
- **Prerequisites:** -
- **Parallel with:** F-01, F-02, S-01, S-02
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Bez tej granicy debugowanie pierwszych sesji może przypadkowo utrwalić prywatne wypowiedzi użytkownika.
- **Status:** ready

## Slices

### S-01: Product landing and limits

- **Outcome:** użytkownik może zrozumieć ofertę, darmową sesję i granice produktu przed założeniem konta.
- **Change ID:** product-landing-and-limits
- **PRD refs:** US-01, FR-001, Non-Functional Requirements
- **Prerequisites:** -
- **Parallel with:** F-01, F-02, F-03, S-02
- **Blockers:** -
- **Unknowns:** -
- **Risk:** To najmniejszy publiczny fragment produktu; jeśli komunikat o granicach będzie słaby, późniejsza sesja może obiecywać więcej niż PRD pozwala.
- **Status:** ready

### S-02: Required account access

- **Outcome:** użytkownik może założyć konto albo zalogować się wymaganymi metodami i wejść do prywatnej części produktu.
- **Change ID:** required-account-access
- **PRD refs:** US-01, FR-002, Access Control
- **Prerequisites:** -
- **Parallel with:** F-01, F-02, F-03, S-01
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Konto jest potrzebne do ciągłości rozmów, ale metoda logowania musi uwzględniać wrażliwy charakter produktu.
- **Status:** ready

### S-03: Modality avatar choice

- **Outcome:** użytkownik może wybrać awatara reprezentującego nurt psychoterapii i przeczytać krótkie wyjaśnienie nurtu.
- **Change ID:** modality-avatar-choice
- **PRD refs:** US-01, FR-004, Business Logic
- **Prerequisites:** S-02, external: lista nurtów MVP
- **Parallel with:** F-01, F-02, F-03, S-01
- **Blockers:** decyzja o liście nurtów MVP
- **Unknowns:**
  - Które nurty psychoterapeutyczne wchodzą do MVP? - Owner: user. Block: yes.
- **Risk:** Wybór awatara jest pierwszym miejscem, gdzie produkt przestaje być generycznym chatbotem; bez listy nurtów nie da się uczciwie zaplanować treści i testów.
- **Status:** blocked

### S-04: First safe timed session

- **Outcome:** użytkownik może odbyć pierwszą bezpieczną 15-minutową sesję w przeglądarce z widocznym czasem i sygnałem trwania odpowiedzi.
- **Change ID:** first-safe-timed-session
- **PRD refs:** US-01, FR-003, FR-005, Non-Functional Requirements
- **Prerequisites:** F-01, F-02, F-03, S-02, S-03
- **Parallel with:** -
- **Blockers:** decyzja o liście nurtów MVP
- **Unknowns:**
  - Które nurty psychoterapeutyczne wchodzą do MVP i jak wpływają na styl pierwszej rozmowy? - Owner: user. Block: yes.
- **Risk:** To najważniejszy przepływ jakościowy; musi wejść dopiero po prywatności danych, granicy kryzysowej i wyborze awatara.
- **Status:** blocked

### S-05: Session history control

- **Outcome:** użytkownik może wrócić do historii sesji i usunąć zapis rozmowy.
- **Change ID:** session-history-control
- **PRD refs:** US-01, FR-006
- **Prerequisites:** F-01, S-04
- **Parallel with:** S-07
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Historia bez kasowania naruszyłaby zaufanie do produktu, więc kontrola użytkownika wchodzi przed budową kolejnych sesji z kontekstem.
- **Status:** proposed

### S-06: Summary-backed next session

- **Outcome:** użytkownik może zobaczyć podsumowanie poprzednich rozmów i rozpocząć kolejną sesję z tym kontekstem.
- **Change ID:** summary-backed-next-session
- **PRD refs:** US-01, FR-007, Business Logic
- **Prerequisites:** F-01, F-02, S-04, S-05
- **Parallel with:** S-07
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Podsumowania mogą utrwalać błędy z rozmowy, dlatego pojawiają się po ręcznie widocznej historii i po granicy bezpieczeństwa rozmowy.
- **Status:** proposed

### S-07: Private admin operations

- **Outcome:** admin może oglądać statystyki i zarządzać użytkownikami bez dostępu do prywatnych treści rozmów.
- **Change ID:** private-admin-operations
- **PRD refs:** FR-009, FR-010, Access Control
- **Prerequisites:** F-01, F-03, S-04
- **Parallel with:** S-05, S-06
- **Blockers:** decyzja o minimalnych statystykach admina
- **Unknowns:**
  - Jakie statystyki produktu admin musi widzieć w MVP, bez dotykania treści rozmów? - Owner: user. Block: yes.
- **Risk:** Admin bez jasno ograniczonego zakresu łatwo rozlewa się na prywatne dane, więc ten slice zostaje za sesją i za granicą danych.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                           | Suggested issue title                         | Ready for `/10x-plan` | Notes                                               |
| ---------- | ----------------------------------- | --------------------------------------------- | --------------------- | --------------------------------------------------- |
| F-01       | private-session-data-boundary       | Establish private session data boundary       | yes                   | Run `/10x-plan private-session-data-boundary`       |
| F-02       | safe-ai-session-boundary            | Establish safe AI session boundary            | yes                   | Run `/10x-plan safe-ai-session-boundary`            |
| F-03       | privacy-safe-operational-visibility | Establish privacy-safe operational visibility | yes                   | Run `/10x-plan privacy-safe-operational-visibility` |
| S-01       | product-landing-and-limits          | Ship product landing and product limits       | yes                   | Run `/10x-plan product-landing-and-limits`          |
| S-02       | required-account-access             | Complete required account access              | yes                   | Run `/10x-plan required-account-access`             |
| S-03       | modality-avatar-choice              | Add modality avatar choice                    | no                    | Blocked by modality list decision                   |
| S-04       | first-safe-timed-session            | Ship first safe timed session                 | no                    | Blocked by S-03 and modality list decision          |
| S-05       | session-history-control             | Add session history control                   | no                    | Wait for first session and private data boundary    |
| S-06       | summary-backed-next-session         | Add summary-backed next session               | no                    | Wait for history control                            |
| S-07       | private-admin-operations            | Add private admin operations                  | no                    | Blocked by admin statistics decision                |

## Open Roadmap Questions

1. **Które nurty psychoterapeutyczne wejdą do MVP?** - Owner: user. Block: S-03, S-04, S-06.

## Parked

- **Aplikacja mobilna** - Why parked: PRD Non-Goals; pierwsza wersja jest produktem webowym.
- **Zastępowanie psychoterapeuty albo diagnoza** - Why parked: PRD Non-Goals; produkt jest symulacją rozmowy i wsparciem edukacyjnym.
- **Domyślny dostęp admina do prywatnych rozmów** - Why parked: PRD Non-Goals; zaufanie i prywatność są warunkiem użycia produktu.
- **Wszystkie nurty psychoterapii** - Why parked: PRD Non-Goals; MVP obejmuje wybraną listę.
- **Gwarancja pomocy w sytuacji kryzysowej** - Why parked: PRD Non-Goals; MVP tylko przerywa symulację i wskazuje pilny kontakt.
- **Płatny upgrade po pierwszej sesji** - Why parked: FR-008 ma priorytet nice-to-have; przy celu jakościowym zostaje poza pierwszą ścieżką bezpieczeństwa i zaufania.

## Done

<!-- Empty on first generation. `/10x-archive` appends entries here and flips matching roadmap items to `Status: done`. -->
