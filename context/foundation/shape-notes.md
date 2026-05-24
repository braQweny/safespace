---
project: SafeSpace
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: sensitive-small
created: 2026-05-24
updated: 2026-05-24
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona scope"
      decision: "Dorosla osoba rozwazajaca psychoterapie, ktora nie wie jeszcze, od czego zaczac."
    - topic: "main use moment"
      decision: "Kryzys emocjonalny tu i teraz, refleksja po trudnej sytuacji albo przygotowanie do realnej terapii."
    - topic: "safety boundary"
      decision: "Symulacja terapii z mocnym komunikatem, ze aplikacja nie zastepuje specjalisty."
    - topic: "access model"
      decision: "Konto uzytkownika z social loginem, ograniczony tryb free/trial oraz role Visitor/trial user, Registered user i Admin."
    - topic: "mvp flow"
      decision: "Landing page, konto/logowanie, wybor avatara/nurtu, 15-minutowa sesja w przegladarce, timer, opoznienie odpowiedzi, historia oraz kontekst kolejnych sesji z podsumowan poprzednich rozmow."
    - topic: "business logic rule"
      decision: "Aplikacja dobiera sposob prowadzenia rozmowy do wybranego nurtu psychoterapeutycznego, charakteru wybranego avatara, aktualnego problemu uzytkownika i bezpiecznie streszczonej historii wczesniejszych sesji."
    - topic: "crisis handling"
      decision: "W sytuacji kryzysowej aplikacja przerywa zwykla symulacje i pokazuje komunikat o pilnym kontakcie ze specjalista lub numerami pomocowymi."
    - topic: "product framing"
      decision: "Pierwszy produkt to web app z backend API; PRD traktuje web app jako produkt glowny, a backend API jako powierzchnie wspierajaca."
    - topic: "target scale"
      decision: "Pierwsze uruchomienie zaklada dziesiatki do okolo 100 uzytkownikow; przy 100x skali regula domenowa zostaje taka sama, ale rosnie nacisk na bezpieczenstwo i moderacje kryzysowa."
    - topic: "non-goals"
      decision: "MVP nie buduje aplikacji mobilnej, nie zastepuje psychoterapeuty ani diagnozy, nie daje adminowi dostepu do rozmow, nie obsluguje wszystkich nurtow i nie gwarantuje pomocy kryzysowej poza eskalacja."
  frs_drafted: 10
  quality_check_status: accepted
---

# Shape Notes

## Seed Idea

Chciałbym stworzyć aplikację opartą na AI, która będzie symulować sesje psychoterapeutyczne, umożliwiając wybór spośród największych i najpopularniejszych nurtów psychoterapii. Aplikacja powinna oferować możliwość wyboru awatara reprezentującego specjalistę z danego nurtu, z którym użytkownik chce pracować. Do każdej nowej sesji powinien być przekazywany kontekst z poprzednich rozmów, aby zachować ciągłość terapii.

## Vision & Problem Statement

Dorosla osoba rozwazajaca psychoterapie, ktora nie wie jeszcze, od czego zaczac, w trudnym momencie psychologicznym szuka pierwszego wsparcia, porady i uporzadkowania mysli, ale nie ma jeszcze jasnosci, czy psychoterapia jest dla niej i jaki nurt pracy moglby jej pomoc. Ten moment moze oznaczac kryzys emocjonalny tu i teraz, refleksje po trudnej sytuacji albo przygotowanie do realnej terapii.

Dzisiaj taka osoba szuka losowych tresci w internecie, rozmawia ze znajomymi, czeka na terapie, zapisuje mysli w notatkach albo nie robi nic. Aplikacja ma odroznic sie od generycznych chatbotow przez skupienie na zalozeniach konkretnych nurtow psychoterapeutycznych, ciaglosc rozmow i jasne ramy: symulacja oraz edukacja, nie zastepstwo specjalisty.

Przy 100x wiekszej skali podstawowa regula rozmowy nie zmienia sie, ale rosnie nacisk na bezpieczenstwo i moderacje sytuacji kryzysowych.

## User & Persona

Primary persona: dorosla osoba rozwazajaca psychoterapie, ktora nie wie jeszcze, od czego zaczac.

Ta osoba siega po produkt, gdy potrzebuje uporzadkowac mysli, zobaczyc problem z innej perspektywy albo lepiej zrozumiec, jak moze wygladac praca w roznych nurtach psychoterapeutycznych. Produkt ma symulowac rozmowe terapeutyczna z mocnym komunikatem, ze nie zastępuje specjalisty.

## Success Criteria

### Primary

- Uzytkownik widzi landing page z informacja o produkcie i darmowej 15-minutowej sesji, zaklada konto albo loguje sie, wybiera avatara reprezentujacego nurt psychoterapii, rozpoczyna pierwsza limitowana sesje w przegladarce i widzi czas trwania rozmowy.
- Po pierwszej sesji uzytkownik moze wrocic do historii, a kolejna rozmowa otrzymuje podsumowanie najwazniejszych faktow z poprzednich sesji jako kontekst ciaglosci.

### Secondary

- Uzytkownik po pierwszej sesji zaklada konto platne.

### Guardrails

- Prywatnosc rozmow uzytkownika nie moze zostac naruszona.
- Produkt jasno komunikuje, ze nie zastepuje specjalisty.
- Produkt obsluguje sytuacje kryzysowe zamiast prowadzic zwykla symulacje rozmowy bez ograniczen.
- Limit czasu sesji jest widoczny i respektowany.
- Admin nie ma dostepu do tresci prywatnych rozmow uzytkownika poza waskimi wyjatkami prawnymi lub bezpieczenstwa.

## User Stories

### US-01: First simulated therapy session

- **Given** a visitor sees the landing page and wants to try the product
- **When** they create an account or sign in, choose a psychotherapy avatar, and start the free 15-minute session
- **Then** they can conduct a browser-based conversation with visible session duration, and the session is saved so later sessions can use summarized context

#### Acceptance Criteria

- The landing page clearly states that the product does not replace a specialist.
- The free session is available only after sign-in.
- The user must choose a psychotherapy avatar before the session starts.
- The session displays elapsed or remaining time.
- The session is stored in history after completion.
- A later session can receive a summary of prior sessions as context.

## Functional Requirements

### Onboarding & Access

- FR-001: Visitor can view the landing page and see information about the free 15-minute session. Priority: must-have
  > Socrates: Counter-argument considered: free-session messaging may attract users only for the trial, without real intent to convert. Resolution: kept; conversion risk accepted as a business risk, not an MVP blocker.
- FR-002: Visitor can create an account or sign in, including with social login and a non-social account option. Priority: must-have
  > Socrates: Counter-argument considered: social login may feel inappropriate for a sensitive mental-health-adjacent product because users may not want to connect this topic with a Google or Apple identity. Resolution: revised to require both social login and a non-social account option.
- FR-003: Registered user can start one limited free 15-minute session. Priority: must-have
  > Socrates: Counter-argument considered: a free AI session may create operating cost without enough abuse controls. Resolution: revised to one limited free 15-minute session.

### Therapy Simulation Session

- FR-004: Registered user can choose an avatar representing a psychotherapy modality with a short explanation of that modality. Priority: must-have
  > Socrates: Counter-argument considered: a beginner user may not understand psychotherapy modalities, so choosing an avatar before conversation could create decision paralysis. Resolution: revised to require a short explanation of each modality.
- FR-005: Registered user can conduct a browser-based conversation with non-intrusive visible session duration. Priority: must-have
  > Socrates: Counter-argument considered: a visible timer may increase pressure instead of helping the conversation. Resolution: revised to make session duration visible but non-intrusive.
- FR-006: Registered user can view and delete session history. Priority: must-have
  > Socrates: Counter-argument considered: session history may become a highly sensitive data store if the user does not have clear control over deletion. Resolution: revised to require deletion control.
- FR-007: Registered user can start a later session that receives context from user-visible summaries of previous conversations. Priority: must-have
  > Socrates: Counter-argument considered: summaries may distort prior statements and carry the error into later sessions. Resolution: revised to make summaries user-visible.

### Monetization

- FR-008: Registered user can upgrade to a paid account after the first session without interrupting or pressuring the support flow. Priority: nice-to-have
  > Socrates: Counter-argument considered: asking for payment after a conversation about a psychological problem may feel emotionally pressuring. Resolution: revised to nice-to-have and constrained to avoid interrupting or pressuring the support flow.

### Administration

- FR-009: Admin can view product statistics. Priority: must-have
  > Socrates: Counter-argument considered: no counter-argument; it stands as written. Resolution: kept.
- FR-010: Admin can manage users without access to private conversation contents except narrow legal or safety exceptions. Priority: must-have
  > Socrates: Counter-argument considered: "without default access" may be too weak; trust would be stronger if admin access to conversation contents is explicitly disallowed except for narrow legal or safety exceptions. Resolution: revised to disallow admin access except narrow legal or safety exceptions.

## Non-Functional Requirements

- Tresc prywatnych rozmow nie jest dostepna adminowi poza waskimi wyjatkami prawnymi lub bezpieczenstwa.
- Przed rozpoczeciem sesji produkt jasno komunikuje, ze nie zastepuje specjalisty.
- Po wyslaniu wiadomosci uzytkownik widzi odpowiedz albo sygnal trwania odpowiedzi.
- Sytuacje kryzysowe sa obslugiwane przez przerwanie zwyklej symulacji i pokazanie instrukcji pilnego kontaktu ze specjalista lub numerami pomocowymi.

## Business Logic

Aplikacja dobiera sposob prowadzenia rozmowy do wybranego nurtu psychoterapeutycznego, charakteru wybranego avatara, aktualnego problemu uzytkownika i bezpiecznie streszczonej historii wczesniejszych sesji.

Kazdy avatar reprezentuje nurt psychoterapeutyczny oraz posiada opis charakteru, ktory moze wplywac na styl rozmowy, np. bardziej zartobliwy albo powazny. W MVP nurty maja byc dobrane jako najpopularniejsze i najskuteczniejsze, ale konkretna lista pozostaje do ustalenia.

Kolejne sesje korzystaja z podsumowan najwazniejszych faktow z poprzednich rozmow, a nie z nieograniczonego surowego kontekstu. Gdy aplikacja rozpozna sytuacje kryzysowa, np. ryzyko samouszkodzenia albo zagrozenie zycia, przerywa zwykla symulacje i pokazuje komunikat o pilnym kontakcie ze specjalista lub numerami pomocowymi.

## Access Control

Aplikacja ma konto uzytkownika, zeby zachowac ciaglosc rozmow miedzy sesjami. Uzytkownik moze logowac sie kontem spolecznosciowym lub inna metoda konta. Produkt ma tez tryb free/trial, ktory pozwala zapoznac sie z aplikacja przez limitowana sesje, np. 15 minut.

Role w MVP:
- Visitor / trial user: moze uruchomic ograniczona sesje zapoznawcza.
- Registered user: ma prywatna historie rozmow i ciaglosc kontekstu miedzy sesjami.
- Admin: ma panel do statystyk i zarzadzania uzytkownikami.

Granica prywatnosci: admin widzi statystyki i dane kont uzytkownikow, ale nie ma dostepu do tresci prywatnych rozmow uzytkownika poza waskimi wyjatkami prawnymi lub bezpieczenstwa.

## Non-Goals

- MVP nie buduje aplikacji mobilnej, bo pierwsza wersja jest produktem webowym.
- MVP nie zastepuje psychoterapeuty ani nie stawia diagnozy, bo produkt jest symulacja rozmowy i wsparciem edukacyjnym.
- MVP nie daje adminowi dostepu do prywatnych tresci rozmow poza waskimi wyjatkami prawnymi lub bezpieczenstwa, bo zaufanie i prywatnosc sa warunkiem uzycia produktu.
- MVP nie obsluguje wszystkich nurtow psychoterapii, tylko wybrana liste MVP.
- MVP nie gwarantuje pomocy w sytuacji kryzysowej poza przerwaniem symulacji i wskazaniem pilnego kontaktu ze specjalista lub numerami pomocowymi.

## Open Questions

1. **Ktore nurty psychoterapeutyczne wejda do MVP?** — Owner: user. Najnowsza decyzja: najpopularniejsze i najskuteczniejsze; konkretna lista do ustalenia przed /10x-prd albo w PRD jako jawne TODO.

## Quality cross-check

Accepted: Access Control present; Business Logic present; project artifact present; timeline-cost acknowledged with `mvp_weeks: 3`; Non-Goals present; preserved behavior not applicable for greenfield.

## Forward: tech-stack

User preference: cala aplikacja ma opierac sie na stacku AWS; autoryzacja i logowanie prawdopodobnie przez AWS Cognito. To jest notatka dla downstream stack selection, nie wymaganie PRD.

User preference: backend API na AWS Lambda i AWS API Gateway. To jest notatka dla downstream stack selection, nie wymaganie PRD.

## Forward: technical-roadmap

Planowana pozniejsza wersja mobilna nie nalezy do pierwszego MVP webowego.
