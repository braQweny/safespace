# First Safe Timed Session - Plan Brief

> Full plan: `context/changes/first-safe-timed-session/plan.md`

## What & Why

S-04 ships the first real SafeSpace conversation: a signed-in user with a saved avatar can consciously start one free 15-minute browser session, see remaining time, send messages, get non-streaming AI responses, and have the successful conversation turns saved. This is the roadmap north star because it proves the core value with account, avatar, time limit, safety boundary, private persistence, and safe operational visibility working together.

## Starting Point

F-01, F-02, F-03, S-02, and S-03 are already implemented in the repo, even though `context/foundation/roadmap.md` still marks S-04 blocked by the old modality-list decision. The current code has protected auth/dashboard, saved avatar choices, private session-data helpers, safety evaluation, and safe session event helpers, but no session page, message endpoint, ordinary AI response helper, timer UI, or chat UI.

## Desired End State

Opening `/dashboard/session` does not consume the free trial. The user must click a clear start action, which claims exactly one 15-minute trial, snapshots the current avatar/modality, starts the timer, and opens the chat surface. Each message is checked by F-02 before ordinary AI generation; successful turns are saved, caution continues with visible boundaries, hard-stop/fail-closed does not persist raw user text, and expired sessions reject new messages.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | S-04 only, no history/summaries/payments | Keeps the north-star session shippable without pulling in S-05, S-06, or FR-008. |
| Trial start | Explicit start click | Prevents accidental page visits from consuming the only free session. |
| AI response UX | Non-streaming with progress state | Meets PRD while keeping first version simpler and safer than streaming. |
| Time limit | Server-authoritative 15-minute expiry | UI timer is helpful, but endpoint rejection is what enforces the limit. |
| Safety persistence | Persist only successful allowed/constrained turns | Hard-stop/fail-closed user text is not stored as raw private history. |
| Caution UX | Continue with visible boundary copy | User understands the constrained mode without unnecessary interruption. |
| Provider failure | Fail closed/retry without fake assistant content | Avoids corrupting conversation history and follows F-02 safety rules. |
| Avatar prerequisite | Redirect/require avatar before claim | Satisfies FR-004 and protects the user's one trial. |
| Tests now | Unit + route-level mocks | Covers high-risk flow without adding Playwright yet. |
| Future tests | E2E handoff document | Captures the desired Playwright path without expanding S-04. |
| AI model config | Separate session AI helper/model env | Keeps ordinary response generation distinct from the safety classifier. |
| Manual evidence | Local browser smoke + privacy sweeps | Practical for current repo; hosted checks stay explicit if secrets/deploy are unavailable. |

## Scope

**In scope:**

- Server-only ordinary session AI helper using OpenRouter non-streaming chat completions.
- Optional `OPENROUTER_SESSION_MODEL` configuration, reusing required `OPENROUTER_API_KEY`.
- `/dashboard/session`, `/api/session/start`, and `/api/session/message`.
- Explicit trial start, avatar prerequisite, server-owned 15-minute timer, and session lifecycle updates.
- React timed chat island with message list, composer, progress state, caution notice, hard-stop/fail-closed UI, and expiry state.
- Unit and route-level tests with mocked Supabase/OpenRouter/safety/operational dependencies.
- E2E handoff note for future Playwright coverage.

**Out of scope:**

- S-05 session history list/delete UI.
- S-06 summaries or next-session context.
- Paid upgrade, billing, admin views, therapist booking, diagnosis, or treatment recommendations.
- Streaming/pseudo-streaming, WebSockets, EventSource, or token-by-token display.
- Raw persistence of hard-stop/fail-closed user text.
- Playwright infrastructure in this change.

## Architecture / Approach

`/dashboard/session` is the SSR shell and passes safe initial state into a React timed-session island. `/api/session/start` authenticates through F-01, requires the S-03 avatar choice, claims the trial, and starts the session. `/api/session/message` enforces expiry, calls F-02, emits F-03 events, calls the new `src/lib/session-ai/` ordinary response helper only for allowed/constrained states, and persists successful turns through F-01 repository helpers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Session AI Response Boundary | Separate ordinary OpenRouter response helper and config | Accidentally weakening or mixing the F-02 safety classifier. |
| 2. Session Start And Page Shell | `/dashboard/session`, start endpoint, avatar prerequisite, trial claim | Consuming the one trial too early or without avatar choice. |
| 3. Message Flow With Safety And Persistence | Message endpoint, safety branching, persistence, retry/expiry behavior | Persisting raw crisis text or fake/duplicate messages. |
| 4. Timed Chat UI And End States | React chat island, timer, progress, caution/hard-stop/expired UI | Timer/UI could imply safety while server enforcement is missing. |
| 5. Tests, Sweeps, Docs, And Handoff | Mocked tests, privacy sweeps, docs, verification, E2E handoff | Closing without real local smoke or overstating hosted evidence. |

**Prerequisites:** F-01/F-02/F-03/S-02/S-03 code is present; local or hosted Supabase has the existing migrations applied for full runtime verification; owner provides `OPENROUTER_API_KEY` for real AI smoke checks.
**Estimated effort:** ~3-4 implementation sessions across 5 phases, plus owner time if hosted Supabase/OpenRouter/Cloudflare verification is required.

## Open Risks & Assumptions

- The roadmap file is stale about the S-03 modality blocker; current code and change artifacts show the modality decision is implemented.
- Hosted verification may remain pending if Supabase migrations, OpenRouter key, or Cloudflare secrets are not available in the implementation session.
- Non-streaming responses are an MVP tradeoff; streaming can be revisited after the session contract is stable.
- Route-level tests use mocks now; browser E2E should be added later from the handoff document.

## Success Criteria (Summary)

- A signed-in user with an avatar can start exactly one free 15-minute session by explicit action, see the timer, send a message, and receive a non-streaming answer.
- Safety decisions are respected before ordinary AI generation; caution is constrained and visible, while hard-stop/fail-closed does not save raw user text.
- Tests, local smoke evidence, and source sweeps prove S-04 stayed inside privacy, safety, no-history, no-summary, and no-streaming boundaries.
