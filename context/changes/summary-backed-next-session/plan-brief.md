# Summary-Backed Next Session - Plan Brief

> Full plan: `context/changes/summary-backed-next-session/plan.md`

## What & Why

S-06 dodaje ciaglosc rozmow bez wczytywania nieograniczonej historii raw messages. Uzytkownik moze utworzyc widoczne podsumowanie zakonczonej albo wygaslej rozmowy, zatwierdzic je jako kontekst i rozpoczac kolejna sesje, ktora korzysta maksymalnie z trzech najnowszych zatwierdzonych podsumowan.

## Starting Point

F-01 ma juz tabele `session_summaries` oraz helpery `saveVisibleSessionSummary()` i `listOwnedSessionSummaries()`. S-04 zapisuje przebieg pierwszej sesji, a S-05 pokazuje historie i usuwa rozmowy razem z ich summary, ale nie ma jeszcze generatora summary, opt-in UI ani startu kolejnej sesji po wykorzystaniu triala.

## Desired End State

Na `/dashboard/avatar` uzytkownik otwiera szczegoly rozmowy, generuje lub ponawia summary, widzi preview i swiadomie zatwierdza "uzyj w kolejnej sesji". Na `/dashboard/session` widzi, ktore zatwierdzone summary zasili kolejna rozmowe, moze wystartowac druga sesje bez billing gate w MVP albo swiadomie zaczac bez kontekstu, gdy summary generation zawiedzie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kolejna sesja | Drugi start bez platnosci w MVP | To jedyny sposob, zeby S-06 spelnilo roadmapowy outcome end-to-end bez czekania na FR-008. | Plan |
| Moment summary | Po zakonczonej/wygaslej sesji na zadanie | Summary powstaje wtedy, gdy uzytkownik rozumie, ktora rozmowa bedzie streszczana. | Plan |
| Uzycie summary | Preview + opt-in | Adresuje ryzyko PRD, ze bledne summary mogloby utrwalic zly kontekst. | Plan |
| Zakres kontekstu | Maksymalnie 3 najnowsze `ready + visible` summaries | Ogranicza koszt i dryf, zachowujac sens ciaglosci. | Plan |
| Awaria summary | Retry + start bez kontekstu | Awaria AI nie powinna blokowac wsparcia, ale fallback musi byc jawny. | Plan |
| Status `stale` | Po zmianie zrodla albo nowszej rewizji | Istniejace statusy F-01 dostaja jasna semantyke zamiast martwego pola. | Research / Plan |
| UI | Historia + przygotowanie sesji | S-05 juz jest miejscem szczegolow historii, a S-04 jest miejscem startu rozmowy. | Research / Plan |

## Scope

**In scope:**

- Owner-bound summary contract over existing `session_summaries`.
- Server-only summary generation through OpenRouter, separate from ordinary session replies.
- Generate/retry/approve/list API for summaries.
- Summary preview and opt-in UI in `/dashboard/avatar` history details.
- Follow-up session start after trial, without billing gate in MVP.
- Max 3 approved summaries as bounded context in ordinary session prompt.
- Unit, route, component tests, privacy/source sweeps, and verification notes.

**Out of scope:**

- Billing, paid accounts, subscriptions, checkout, or upgrade gate.
- Admin access to conversation messages or summary text.
- User editing of generated summaries.
- Summary search, exports, titles, labels, analytics, or admin aggregates.
- Streaming, WebSocket, EventSource, or Playwright infrastructure.
- New Supabase migration unless implementation discovers a hard schema blocker.

## Architecture / Approach

S-06 stays above the F-01 private data boundary. Summary generation reads one owned non-deleted conversation, writes a visible draft/ready revision through summary helpers, and never logs raw content. Follow-up session start uses the existing timed-session shell but creates a non-trial session path; ordinary AI generation receives at most three approved summaries, not raw prior messages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Summary Contract And Generation | Summary helper semantics plus server-only generator | Leaking raw messages or creating invisible context. |
| 2. Summary API And History UI | Generate/retry/approve in history details | UI could imply context is used before opt-in. |
| 3. Summary-Backed Next Session Flow | Follow-up session start and prompt context | Weakening trial boundary or using raw history. |
| 4. Tests, Sweeps, Verification | Full local gate and privacy proof | Passing tests while missing a content/logging regression. |

**Prerequisites:** F-01, F-02, S-04 and S-05 are implemented in the repo; `OPENROUTER_API_KEY` is available only for real hosted/local AI smoke.
**Estimated effort:** ~3 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Follow-up MVP sessions reuse the existing 15-minute timed-session UX and server expiry, but are non-trial sessions.
- Existing `session_summaries` fields are enough for MVP opt-in: approved context is represented by `status = "ready"` and `is_visible = true`.
- Hosted checks may remain pending if Supabase/OpenRouter/Cloudflare secrets are not available.

## Success Criteria (Summary)

- User can create, preview, retry, and approve a visible summary from a saved non-deleted conversation.
- A follow-up session can start after the free trial and clearly shows whether approved summaries will be used.
- Ordinary AI generation uses at most three approved summaries and never raw prior-session messages as next-session context.
