# Safe AI Session Boundary - Plan Brief

> Full plan: `context/changes/safe-ai-session-boundary/plan.md`

## What & Why

Implement F-02: a server-side safety boundary for future AI sessions. The goal is to make sure S-04 cannot run ordinary psychotherapy simulation until a safety classifier has checked the current user message and returned a clear `normal`, `caution`, or `crisis` decision.

## Starting Point

SafeSpace has auth, protected dashboard, landing safety copy, and S-03 avatar/modality choice. It does not yet have chat, timer, session, AI, history, or summary endpoints, so F-02 builds the reusable boundary rather than a visible conversation feature.

## Desired End State

The repo exposes `evaluateSessionSafety(input)` for future S-04 code. It uses an OpenRouter classifier with structured JSON output, validates the provider result locally, fails closed on provider/config/schema failures, and returns hard-stop crisis resources instead of ordinary simulation when risk is `crisis`.

## Key Decisions Made

| Decision           | Choice                                                     | Why                                                                               |
| ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Scope              | Enforceable safety contract, not full chat                 | F-02 unlocks S-04 without implementing S-04.                                      |
| Risk states        | `normal`, `caution`, `crisis`                              | More useful than binary allow/block while staying MVP-sized.                      |
| Crisis resources   | Poland + United States + local fallback                    | User selected multi-country support immediately.                                  |
| Crisis UX          | Hard-stop ordinary simulation                              | Matches PRD requirement to interrupt normal simulation in crisis.                 |
| Classifier         | OpenRouter model classifier                                | User selected model-based safety classification for F-02.                         |
| Safety entry point | `evaluateSessionSafety(input)` before every future AI call | Gives S-04 one non-bypassable contract.                                           |
| Data storage       | No content or safety-event persistence in F-02             | Keeps privacy risk out of this foundation.                                        |
| Failure mode       | Fail closed                                                | Missing key, network errors, and malformed JSON cannot allow ordinary simulation. |
| Tests              | Minimal Vitest + mocked provider                           | Safety logic needs regression coverage before S-04 depends on it.                 |

## Scope

**In scope:**

- Safety decision types and reason codes.
- Crisis resources for Poland, United States, and local fallback.
- OpenRouter classifier using server-side `fetch` and structured JSON output.
- Local validation and fail-closed evaluator behavior.
- `caution` constraints for future S-04 prompt/response handling.
- Minimal Vitest setup for pure safety logic and mocked provider failures.
- OpenRouter secret/config documentation across local, CI, Wrangler, and deploy docs.

**Out of scope:**

- Chat UI, timer, streaming, session route, message API, history, summaries, or paid flow.
- Supabase safety-event table or any persistence of safety decisions.
- Logging prompts, user messages, classifier input, provider responses, or private content.
- Geolocation or automatic country-specific resource routing.
- E2E browser tests for a session that does not exist yet.

## Architecture / Approach

F-02 creates a server-only safety module under `src/lib/session-safety/`. A future session handler sends the current user message to `evaluateSessionSafety(input)`, which calls a mockable OpenRouter provider, validates structured output, and returns `allow`, `allow_with_constraints`, `hard_stop`, or fail-closed unavailability behavior. S-04 will branch on that result before any ordinary model generation.

## Phases at a Glance

| Phase                                       | What it delivers                                        | Key risk                                                    |
| ------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| 1. Safety Contract And Crisis Resources     | Risk types, resources, reason codes, hard-stop copy     | Copy could imply diagnosis or emergency service.            |
| 2. OpenRouter Safety Classifier Boundary    | Worker-compatible classifier with JSON schema output    | Provider output may be malformed or model support may vary. |
| 3. Fail-Closed Evaluation And S-04 Contract | Single evaluator, caution constraints, crisis hard-stop | Future S-04 could bypass the boundary if handoff is weak.   |
| 4. Minimal Tests And Verification Setup     | Vitest and mocked provider tests                        | First test runner could grow beyond the narrow safety need. |
| 5. Config, Deployment Notes, And Handoff    | Secrets, CI, docs, deploy updates, final scope sweep    | Runtime secret setup must stay owner-owned and not leak.    |

**Prerequisites:** Existing auth/dashboard/S-03 code; owner has or can create an OpenRouter API key for runtime verification.
**Estimated effort:** ~2-3 implementation sessions across 5 phases.

## Open Risks & Assumptions

- OpenRouter structured output support is model/provider-specific, so the model must remain configurable and the app must validate locally.
- F-02 will not store safety events; F-03 must add privacy-safe observability later if needed.
- Hosted runtime verification depends on owner-provided OpenRouter secrets in GitHub and Cloudflare.
- The future S-04 implementation must honor the `evaluateSessionSafety()` call order.

## Success Criteria (Summary)

- Future session code has one clear safety boundary to call before ordinary AI generation.
- `crisis` produces a hard-stop resource payload; `caution` produces constrained continuation; provider/config failures fail closed.
- Tests cover all three risk states and provider failure without real OpenRouter calls or private content logging.
