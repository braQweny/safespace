# Safe AI Session Boundary Implementation Plan

## Overview

Implement F-02: an enforceable safety boundary for the future AI session flow. The change adds a server-side AI safety classifier, stable safety decision types, crisis resource payloads, fail-closed behavior, and minimal automated tests so S-04 cannot start ordinary simulation without passing through a safety decision.

## Current State Analysis

SafeSpace already has a protected dashboard, Supabase SSR auth, S-03 avatar/modality choice, and a static modality catalog with `sessionStyleHint` values. It does not yet have session, chat, AI, timer, history, or summary endpoints. The roadmap marks F-02 as a foundation that unlocks S-04 and S-06; the plan therefore must create a reusable boundary, not a user-facing chat surface.

The current deployment path is Cloudflare Workers with server-only Astro env fields and Wrangler secrets. `OPENROUTER_API_KEY` is still documented as a future AI milestone in `context/deployment/deploy-plan.md`, but the user selected an AI classifier for F-02, so this plan moves the OpenRouter secret into the active F-02 configuration contract. There is no test runner today; the user explicitly selected a minimal test runner for pure safety logic and mocked provider behavior.

## Desired End State

The repo exposes a single safety entry point, `evaluateSessionSafety(input)`, that a future S-04 session endpoint must call before every ordinary AI response. The boundary returns one of three risk states: `normal`, `caution`, or `crisis`. `normal` allows the future session to continue, `caution` allows continuation only with restricted safe-response constraints, and `crisis` returns a hard-stop payload with crisis resources instead of allowing ordinary psychotherapy simulation.

The classifier uses OpenRouter server-side with structured JSON output and strict local validation. Missing env, network failure, provider errors, malformed JSON, or schema mismatch all fail closed and do not permit ordinary simulation. No conversation content, prompt, classifier input, or model output is written to logs or database by F-02.

### Key Discoveries:

- Roadmap F-02 requires a minimal AI conversation safety boundary with clear limits, crisis interruption, and no ordinary simulation in danger states: `context/foundation/roadmap.md:80`.
- Roadmap S-04 depends on F-02 before first timed session work can proceed: `context/foundation/roadmap.md:38`.
- The PRD requires crisis situations to interrupt ordinary simulation and show urgent contact guidance: `context/foundation/prd.md:100`.
- The PRD says conversation style later depends on the selected modality/avatar and user problem, so F-02 must produce a future-compatible contract without implementing the full session: `context/foundation/prd.md:109`.
- Current code has no session/history/AI endpoints yet: `context/foundation/roadmap.md:59`.
- The S-03 catalog already exposes `sessionStyleHint` values that S-04 can later combine with F-02 caution constraints: `src/lib/modalities.ts:10`.
- Astro env schema currently declares only Supabase server secrets: `astro.config.mjs:17`.
- Wrangler currently requires only Supabase secrets: `wrangler.jsonc:7`.
- CI currently runs `npx astro sync`, lint, and build, but no tests: `.github/workflows/ci.yml:21`.
- `package.json` has no test script or test dependency today: `package.json:5`.
- Infrastructure notes already warn that AI libraries must be Worker-compatible and that prompt/request logging would be a privacy incident: `context/foundation/infrastructure.md:63`, `context/foundation/infrastructure.md:67`.
- OpenRouter Chat Completions use `POST https://openrouter.ai/api/v1/chat/completions` with Bearer auth and an OpenAI-compatible schema: `https://openrouter.ai/docs/api/reference/overview`.
- OpenRouter structured outputs use `response_format` with `type: "json_schema"` and strict JSON schema support for compatible models: `https://openrouter.ai/docs/guides/features/structured-outputs`.
- OpenRouter authenticates direct calls with `Authorization: Bearer <OPENROUTER_API_KEY>`: `https://openrouter.ai/docs/api/reference/authentication`.
- OpenRouter currently lists `openai/gpt-4o-mini` as supporting structured output generation and `openai/gpt-5.2` as supporting the `Response Format` parameter; the implementation should keep the model configurable and default to the lower-cost structured-output model unless the owner changes it: `https://openrouter.ai/openai/gpt-4o-mini?tab=parameters`, `https://openrouter.ai/openai/gpt-5.2`.
- Official Polish emergency guidance confirms 112 for urgent life/health danger, and the Polish Ministry of Health lists psychological crisis support including 800 70 2222: `https://www.gov.pl/web/numer-alarmowy-112/numer-alarmowy`, `https://www.gov.pl/web/zdrowie/pomoc-psychologiczna`.
- The official 988 Lifeline describes 988 as a United States crisis and suicide lifeline: `https://988lifeline.org/about/`.

## What We're NOT Doing

- No chat UI, message composer, timer, typing indicator, streaming response, session route, or conversation history.
- No S-04 first timed session implementation.
- No S-06 summary generation or summary-backed next-session logic.
- No Supabase table for safety events and no database persistence of safety decisions.
- No logging of user messages, prompts, classifier inputs, classifier outputs, or generated responses.
- No admin visibility into private conversation content or safety-triggering text.
- No diagnosis, therapy recommendation, treatment selection, or claim that the app can assess clinical risk.
- No location detection, geolocation, or automatic country-specific emergency routing.
- No E2E browser test framework for the future chat flow.
- No OpenRouter management guardrail creation through management keys.

## Implementation Approach

Build F-02 as a reusable server-side library layer. First define the safety decision contract and crisis resource payloads. Then implement an OpenRouter-based classifier behind a small provider interface that can be mocked in tests. Next wrap the classifier in `evaluateSessionSafety(input)`, which normalizes all success and failure outcomes into a safe decision. Finally add Vitest for pure logic and mocked provider tests, update runtime secret documentation, and add source sweeps that prove no S-04 chat surface or unsafe logging was introduced.

## Critical Implementation Details

### Timing & lifecycle

The future S-04 endpoint must call `evaluateSessionSafety(input)` before any ordinary AI simulation request. F-02 should not add the S-04 endpoint, but the exported function and plan references must make the call order unambiguous.

### State sequencing

`crisis` takes precedence over modality style, timer state, and ordinary response generation. `caution` still permits future S-04 continuation, but only through explicit response constraints returned by the safety boundary.

### Debug & observability

F-02 may expose stable reason codes and boolean status for future F-03 observability, but it must not log or persist private text. Provider failures should be debugged through safe error categories such as `provider_unavailable`, `invalid_provider_response`, or `missing_configuration`.

## Phase 1: Safety Contract And Crisis Resources

### Overview

Define the core risk states, decision payloads, crisis resource catalog, and hard-stop message contract that all later F-02 code uses.

### Changes Required:

#### 1. Safety Types

**File**: `src/lib/session-safety/types.ts`

**Intent**: Create one canonical contract for AI session safety decisions so future session code cannot invent its own risk vocabulary.

**Contract**: Export `SessionSafetyRisk = "normal" | "caution" | "crisis"`, action types for ordinary allow, constrained allow, and hard stop, plus `SessionSafetyInput` and `SessionSafetyDecision` interfaces. The input includes the current user message and optional metadata needed by the future session boundary, but does not require raw session history. The decision includes a stable reason code, user-safe message key or payload, and no raw provider text.

#### 2. Crisis Resource Catalog

**File**: `src/lib/session-safety/crisis-resources.ts`

**Intent**: Provide the crisis resource payload chosen during planning: Poland, United States, and local-emergency fallback.

**Contract**: Export a readonly resource catalog with stable region IDs such as `pl`, `us`, and `local_fallback`. Poland includes 112 and 800 70 2222. United States includes 988 and emergency guidance for immediate danger. The fallback tells users outside listed regions to contact their local emergency number or a local crisis line. Entries are informational resources, not guarantees of help.

#### 3. Safety Copy Helpers

**File**: `src/lib/session-safety/safety-copy.ts`

**Intent**: Keep crisis and unavailability copy consistent and separate from provider code.

**Contract**: Export functions that produce user-facing Polish copy for `crisis`, `caution`, and fail-closed unavailability states. The hard-stop copy says the ordinary simulation cannot continue in this state and points to crisis resources. It must not claim that SafeSpace has diagnosed risk or contacted services.

#### 4. Reason Code Vocabulary

**File**: `src/lib/session-safety/reason-codes.ts`

**Intent**: Give future F-03 observability a safe vocabulary without storing private text.

**Contract**: Export reason codes such as `none_detected`, `ambiguous_distress`, `self_harm_signal`, `harm_to_others_signal`, `immediate_danger_signal`, `provider_unavailable`, `invalid_provider_response`, and `missing_configuration`. Codes are stable and generic; they do not include snippets or inferred diagnoses.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds exactly one definition of `SessionSafetyRisk`.
- Source search finds no crisis resource catalog entry that claims SafeSpace provides emergency help.

#### Manual Verification:

- The safety contract exposes exactly three risk states: `normal`, `caution`, and `crisis`.
- Crisis resources include Poland, United States, and a local fallback.
- Polish crisis copy uses a hard-stop framing and does not sound like diagnosis, treatment, or therapy.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets; the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: OpenRouter Safety Classifier Boundary

### Overview

Implement the selected AI-based classifier behind a Worker-compatible server-only provider layer with structured JSON output.

### Changes Required:

#### 1. OpenRouter Environment Schema

**File**: `astro.config.mjs`

**Intent**: Declare OpenRouter configuration as server-only runtime configuration.

**Contract**: Add `OPENROUTER_API_KEY` as a server-only secret. Add `OPENROUTER_SAFETY_MODEL` as server-only optional configuration if the implementation chooses env-based model selection; otherwise define the default model in code and document how to change it. Missing key must not break build, but runtime classification must fail closed.

#### 2. OpenRouter Classifier Client

**File**: `src/lib/session-safety/openrouter-classifier.ts`

**Intent**: Call OpenRouter Chat Completions directly through `fetch` so the code remains compatible with Cloudflare Workers and does not depend on Node-only SDK behavior.

**Contract**: Export a classifier function that accepts sanitized `SessionSafetyInput`, sends a minimal classification prompt to `https://openrouter.ai/api/v1/chat/completions`, includes `Authorization: Bearer <OPENROUTER_API_KEY>`, uses a structured `response_format` JSON schema, sets low temperature and low max output, and returns only the parsed safety decision shape. The default model should be `openai/gpt-4o-mini` because OpenRouter currently lists it with structured output support and it is more suitable for low-token classification than a frontier model. The model remains configurable.

#### 3. Classifier Prompt Contract

**File**: `src/lib/session-safety/classifier-prompt.ts`

**Intent**: Make the model classification task narrow, non-clinical, and parseable.

**Contract**: The prompt asks the model only to classify user text into `normal`, `caution`, or `crisis`, return one approved reason code, and avoid advice generation. It must explicitly state that it is not diagnosing or treating the user. It should bias toward `crisis` for direct self-harm, suicide, imminent harm to others, or immediate life/health danger, and toward `caution` for ambiguous distress that does not express immediate danger.

#### 4. Provider Response Parser

**File**: `src/lib/session-safety/parse-provider-decision.ts`

**Intent**: Treat provider structured output as an input to validate, not as trusted application state.

**Contract**: Parse the provider response shape, validate required fields and enum values locally, and reject unknown risk states, unknown reason codes, extra unsafe action values, missing choice content, or non-JSON content. Rejections surface as a safe provider error category that the evaluator maps to fail-closed.

#### 5. Provider Interface For Tests

**File**: `src/lib/session-safety/provider.ts`

**Intent**: Keep the OpenRouter call mockable for unit tests and future alternative providers.

**Contract**: Export a small provider interface such as `classify(input): Promise<ProviderSafetyResult>`. `evaluateSessionSafety()` depends on this interface, while production wiring uses the OpenRouter implementation.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search shows OpenRouter is called only from `src/lib/session-safety/openrouter-classifier.ts`.
- Source search shows no OpenRouter API key is referenced from client components or Astro pages.
- Source search shows the classifier uses `response_format` with `json_schema`.

#### Manual Verification:

- The classifier prompt asks for classification only, not therapy advice.
- The classifier sends only the current classification input needed for F-02 and does not include full session history.
- A missing or malformed provider response is represented as a safe internal error category, not raw model text.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Fail-Closed Evaluation And S-04 Contract

### Overview

Wrap the classifier in the single safety boundary future session code must call, including fail-closed handling, `caution` constraints, and `crisis` hard-stop payloads.

### Changes Required:

#### 1. Safety Evaluator

**File**: `src/lib/session-safety/evaluate-session-safety.ts`

**Intent**: Provide the canonical `evaluateSessionSafety(input)` function for S-04.

**Contract**: Export `evaluateSessionSafety(input, options?)`. It calls the configured classifier provider, normalizes provider output into `SessionSafetyDecision`, and catches missing config, fetch errors, timeouts, invalid JSON, unsupported risk states, and parser failures. Any error returns a fail-closed decision that blocks ordinary simulation and shows safe unavailability copy. The function must not log the input message.

#### 2. Normal Decision Contract

**File**: `src/lib/session-safety/evaluate-session-safety.ts`

**Intent**: Let future S-04 continue ordinary simulation only when the safety classifier returns a valid `normal` decision.

**Contract**: `normal` maps to an allow action with no crisis resource payload and no user-facing alarm copy. It may carry stable reason code `none_detected` for future internal control flow.

#### 3. Caution Decision Contract

**File**: `src/lib/session-safety/evaluate-session-safety.ts`

**Intent**: Make ambiguous distress safer without interrupting every non-immediate concern.

**Contract**: `caution` maps to an allow-with-constraints action. The returned constraints tell S-04 to avoid diagnosis, avoid risk-increasing instructions, avoid prescriptive treatment claims, use supportive non-clinical language, and include a brief boundary reminder if the user's distress escalates. It does not show the full crisis hard-stop screen.

#### 4. Crisis Decision Contract

**File**: `src/lib/session-safety/evaluate-session-safety.ts`

**Intent**: Enforce the PRD rule that ordinary simulation stops in a crisis state.

**Contract**: `crisis` maps to a hard-stop action and returns resource payloads for Poland, United States, and local fallback. It must not return a prompt that asks the ordinary AI model to keep role-playing a therapist. It should be immediately renderable by the future S-04 UI.

#### 5. Future Integration Guide

**File**: `src/lib/session-safety/README.md`

**Intent**: Make the S-04 call order and non-bypass rule obvious to the next implementer.

**Contract**: The README states that future session message handlers must call `evaluateSessionSafety()` before ordinary model generation, must branch on the returned action, must not log private text, and must treat fail-closed as a block. It also documents that F-02 does not add chat UI or session persistence.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search finds exactly one exported `evaluateSessionSafety` entry point.
- Source search finds no new `/api/session`, `/api/chat`, timer, or session UI route.
- Source search finds no `console.log` or `console.error` call that includes `message`, `prompt`, `content`, or provider response text in the session-safety module.

#### Manual Verification:

- `normal` is the only state that permits ordinary future simulation.
- `caution` returns explicit response constraints and does not hard-stop.
- `crisis` returns a hard-stop payload with crisis resources and no ordinary simulation prompt.
- Missing OpenRouter configuration produces safe unavailability behavior, not ordinary simulation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Minimal Tests And Verification Setup

### Overview

Add the first minimal test runner for high-risk pure safety logic and provider mocking without real OpenRouter calls.

### Changes Required:

#### 1. Vitest Dependency And Scripts

**File**: `package.json`, `package-lock.json`

**Intent**: Add a minimal test runner because F-02 is a high-risk safety boundary.

**Contract**: Add Vitest as a dev dependency and add scripts such as `test` or `test:safety`. The test command must run without Supabase or OpenRouter secrets. Keep existing lint/build scripts unchanged.

#### 2. Vitest Config

**File**: `vitest.config.ts`

**Intent**: Configure tests for TypeScript modules without introducing browser E2E or jsdom unless needed.

**Contract**: Use a Node-like or edge-compatible test environment suitable for pure functions and mocked `fetch`. Preserve the `@/*` alias if Vitest needs explicit resolution. No real network calls are allowed.

#### 3. Decision Parser Tests

**File**: `src/lib/session-safety/__tests__/parse-provider-decision.test.ts`

**Intent**: Lock down local validation around structured output.

**Contract**: Test valid `normal`, `caution`, and `crisis` provider outputs; reject unknown risk values, missing action fields, unknown reason codes, malformed JSON, empty choices, and extra unsupported action values.

#### 4. Evaluator Fail-Closed Tests

**File**: `src/lib/session-safety/__tests__/evaluate-session-safety.test.ts`

**Intent**: Prove that provider failure cannot accidentally allow ordinary simulation.

**Contract**: Mock the provider to return each valid decision and to throw network/config/parser errors. Assert that failures map to hard-stop or unavailable fail-closed decisions, and that no test needs `OPENROUTER_API_KEY`.

#### 5. Crisis Resource Tests

**File**: `src/lib/session-safety/__tests__/crisis-resources.test.ts`

**Intent**: Keep the selected multi-country resource payload stable.

**Contract**: Test that Poland, United States, and local fallback entries exist and that hard-stop decisions include resources without claiming SafeSpace contacted emergency services.

### Success Criteria:

#### Automated Verification:

- `npm run test` or `npm run test:safety` completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- Source search confirms tests do not require or read a real `OPENROUTER_API_KEY`.
- Source search confirms tests do not make real network calls.

#### Manual Verification:

- Test names cover the three selected risk states and fail-closed provider behavior.
- The added test setup is minimal and does not introduce E2E/browser infrastructure.
- The new CI command, if added to CI in Phase 5, is acceptable for normal PR runtime.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Config, Deployment Notes, And Handoff

### Overview

Wire the new AI safety configuration into local examples, Wrangler/GitHub deploy notes, CI gates, and implementation handoff without exposing secrets or adding user-facing session functionality.

### Changes Required:

#### 1. Local Environment Example

**File**: `.env.example`

**Intent**: Tell developers which AI safety variables are now part of local setup.

**Contract**: Add placeholders for `OPENROUTER_API_KEY` and, if used, `OPENROUTER_SAFETY_MODEL`. Placeholder values must not look like real secrets. The example should keep Supabase variables unchanged.

#### 2. Wrangler Required Secrets

**File**: `wrangler.jsonc`

**Intent**: Make production Worker configuration explicit now that F-02 uses OpenRouter for safety classification.

**Contract**: Add `OPENROUTER_API_KEY` to required Worker secrets. Do not add management keys or service-role keys. If `OPENROUTER_SAFETY_MODEL` is runtime-configured, decide whether it belongs in code defaults, `.dev.vars`, or deployment docs; it is not a secret.

#### 3. GitHub Actions CI And Deploy

**File**: `.github/workflows/ci.yml`

**Intent**: Ensure the new safety tests run in CI and the production deployment passes the OpenRouter key to Wrangler.

**Contract**: Add the selected test command after install and before build. Build jobs should not need a real OpenRouter key if env schema is optional at build time. Deploy should include `OPENROUTER_API_KEY` in the temporary secrets file passed to Wrangler and read it from GitHub repository secrets.

#### 4. Deployment Runbook

**File**: `context/deployment/deploy-plan.md`

**Intent**: Update deployment documentation from "OpenRouter later" to "OpenRouter required for F-02 runtime safety".

**Contract**: Replace or revise the outdated note that `OPENROUTER_API_KEY` belongs to a future milestone. Document owner-owned setup for Cloudflare Worker secret and GitHub repository secret. State that missing runtime key makes the boundary fail closed and prevents ordinary future simulation.

#### 5. README Setup

**File**: `README.md`

**Intent**: Keep repo setup accurate for local and hosted developers.

**Contract**: Document the new local `.env` / `.dev.vars` variables and GitHub secret. Keep the explanation server-only: OpenRouter secrets never go to client components and are not committed.

#### 6. Source And Scope Sweep

**File**: `context/changes/safe-ai-session-boundary/plan.md`

**Intent**: Keep implementation closure tied to the plan and prove F-02 stayed in scope.

**Contract**: `/10x-implement` updates only the `## Progress` section. Final verification includes searches for committed secrets, ordinary chat/session routes, private text logging, and real network calls in tests. Any inability to set hosted OpenRouter secrets is recorded in implementation notes or PR text without changing phase titles.

### Success Criteria:

#### Automated Verification:

- `npm run test` or `npm run test:safety` completes successfully.
- `npx astro sync` completes successfully.
- `npm run lint` completes successfully.
- `npm run build` completes successfully.
- `git diff --check` reports no whitespace errors.
- Source search finds no committed OpenRouter API key value.
- Source search confirms no S-04 chat/timer/session route was added.
- Source search confirms no code logs `prompt`, `message`, `content`, classifier input, or provider output from the safety boundary.

#### Manual Verification:

- `.env.example`, README, Wrangler config, GitHub Actions, and deploy plan agree on the OpenRouter secret contract.
- The deploy plan clearly states owner-owned OpenRouter key setup and no OpenRouter management key requirement.
- The F-02 handoff tells S-04 implementers to call `evaluateSessionSafety()` before ordinary AI generation.
- F-02 is still a foundation boundary and not a visible chat/session feature.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before considering the change implemented.

---

## Testing Strategy

### Unit Tests:

- Add minimal Vitest coverage for pure safety types, provider response parsing, resource catalog stability, and `evaluateSessionSafety()` fail-closed behavior.
- Mock provider behavior instead of calling OpenRouter.
- Cover all selected decision states: `normal`, `caution`, and `crisis`.
- Cover malformed provider response, network failure, missing configuration, and unknown enum values.

### Integration Tests:

- No browser E2E or full API integration tests in F-02.
- No real OpenRouter network call in CI.
- Future S-04 should add integration tests around the session message endpoint once that endpoint exists.

### Manual Testing Steps:

1. Review `src/lib/session-safety/types.ts` and confirm there are exactly three risk states.
2. Review crisis resources and confirm Poland, United States, and local fallback are present.
3. Run the safety tests without `OPENROUTER_API_KEY` and confirm they pass.
4. Temporarily run a local manual classification smoke check only if the owner provides a local OpenRouter key in `.env` or `.dev.vars`.
5. Confirm missing OpenRouter key returns fail-closed behavior.
6. Search the diff for `console.log`, `console.error`, `prompt`, `message`, and `content` to confirm private text is not logged by safety code.
7. Confirm no `/api/session`, `/api/chat`, chat UI, timer, or history route was introduced.
8. Confirm deploy docs and CI docs name `OPENROUTER_API_KEY` as a secret and never as a committed value.

## Performance Considerations

F-02 adds one future model call before ordinary session generation. Keep the classification prompt short, use a low-output structured response, and set an explicit timeout so future S-04 does not hang on provider latency. Failures must fail closed. Do not introduce an SDK that depends on Node-only APIs; use Worker-compatible `fetch` unless a future review proves a SDK works cleanly on Cloudflare Workers.

## Migration Notes

No Supabase migration is required. F-02 intentionally avoids a safety-events table and any storage of private messages. Runtime configuration changes are secret/config changes only: `OPENROUTER_API_KEY` must be added to local `.env` or `.dev.vars`, GitHub repository secrets, and Cloudflare Worker secrets before production use.

## References

- Roadmap F-02: `context/foundation/roadmap.md:80`
- Roadmap S-04 dependency on F-02: `context/foundation/roadmap.md:38`
- Roadmap baseline for missing AI/session endpoints: `context/foundation/roadmap.md:59`
- PRD crisis handling requirement: `context/foundation/prd.md:100`
- PRD future session business logic: `context/foundation/prd.md:109`
- Current modality style hints: `src/lib/modalities.ts:10`
- Current Astro env schema: `astro.config.mjs:17`
- Current Wrangler required secrets: `wrangler.jsonc:7`
- Current CI gates: `.github/workflows/ci.yml:21`
- Current package scripts: `package.json:5`
- Infrastructure AI/Workers compatibility risk: `context/foundation/infrastructure.md:63`
- Infrastructure private prompt logging risk: `context/foundation/infrastructure.md:67`
- OpenRouter API overview: `https://openrouter.ai/docs/api/reference/overview`
- OpenRouter authentication: `https://openrouter.ai/docs/api/reference/authentication`
- OpenRouter structured outputs: `https://openrouter.ai/docs/guides/features/structured-outputs`
- OpenRouter `openai/gpt-4o-mini` model page: `https://openrouter.ai/openai/gpt-4o-mini?tab=parameters`
- OpenRouter `openai/gpt-5.2` model page: `https://openrouter.ai/openai/gpt-5.2`
- Poland emergency number 112: `https://www.gov.pl/web/numer-alarmowy-112/numer-alarmowy`
- Polish Ministry of Health psychological support: `https://www.gov.pl/web/zdrowie/pomoc-psychologiczna`
- United States 988 Lifeline: `https://988lifeline.org/about/`
- Progress format reference: `.agents/skills/10x-plan/references/progress-format.md:1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `.agents/skills/10x-plan/references/progress-format.md`.

### Phase 1: Safety Contract And Crisis Resources

#### Automated

- [x] 1.1 `npx astro sync` completes successfully. — a16ba5a
- [x] 1.2 `npm run lint` completes successfully. — a16ba5a
- [x] 1.3 `npm run build` completes successfully. — a16ba5a
- [x] 1.4 Source search finds exactly one definition of `SessionSafetyRisk`. — a16ba5a
- [x] 1.5 Source search finds no crisis resource catalog entry that claims SafeSpace provides emergency help. — a16ba5a

#### Manual

- [x] 1.6 The safety contract exposes exactly three risk states: `normal`, `caution`, and `crisis`. — a16ba5a
- [x] 1.7 Crisis resources include Poland, United States, and a local fallback. — a16ba5a
- [x] 1.8 Polish crisis copy uses a hard-stop framing and does not sound like diagnosis, treatment, or therapy. — a16ba5a

### Phase 2: OpenRouter Safety Classifier Boundary

#### Automated

- [x] 2.1 `npx astro sync` completes successfully. — 8c2d5ff
- [x] 2.2 `npm run lint` completes successfully. — 8c2d5ff
- [x] 2.3 `npm run build` completes successfully. — 8c2d5ff
- [x] 2.4 Source search shows OpenRouter is called only from `src/lib/session-safety/openrouter-classifier.ts`. — 8c2d5ff
- [x] 2.5 Source search shows no OpenRouter API key is referenced from client components or Astro pages. — 8c2d5ff
- [x] 2.6 Source search shows the classifier uses `response_format` with `json_schema`. — 8c2d5ff

#### Manual

- [x] 2.7 The classifier prompt asks for classification only, not therapy advice. — 8c2d5ff
- [x] 2.8 The classifier sends only the current classification input needed for F-02 and does not include full session history. — 8c2d5ff
- [x] 2.9 A missing or malformed provider response is represented as a safe internal error category, not raw model text. — 8c2d5ff

### Phase 3: Fail-Closed Evaluation And S-04 Contract

#### Automated

- [x] 3.1 `npx astro sync` completes successfully. — 413311a
- [x] 3.2 `npm run lint` completes successfully. — 413311a
- [x] 3.3 `npm run build` completes successfully. — 413311a
- [x] 3.4 Source search finds exactly one exported `evaluateSessionSafety` entry point. — 413311a
- [x] 3.5 Source search finds no new `/api/session`, `/api/chat`, timer, or session UI route. — 413311a
- [x] 3.6 Source search finds no `console.log` or `console.error` call that includes `message`, `prompt`, `content`, or provider response text in the session-safety module. — 413311a

#### Manual

- [x] 3.7 `normal` is the only state that permits ordinary future simulation. — 413311a
- [x] 3.8 `caution` returns explicit response constraints and does not hard-stop. — 413311a
- [x] 3.9 `crisis` returns a hard-stop payload with crisis resources and no ordinary simulation prompt. — 413311a
- [x] 3.10 Missing OpenRouter configuration produces safe unavailability behavior, not ordinary simulation. — 413311a

### Phase 4: Minimal Tests And Verification Setup

#### Automated

- [x] 4.1 `npm run test` or `npm run test:safety` completes successfully. — 0e2ea6f
- [x] 4.2 `npx astro sync` completes successfully. — 0e2ea6f
- [x] 4.3 `npm run lint` completes successfully. — 0e2ea6f
- [x] 4.4 `npm run build` completes successfully. — 0e2ea6f
- [x] 4.5 Source search confirms tests do not require or read a real `OPENROUTER_API_KEY`. — 0e2ea6f
- [x] 4.6 Source search confirms tests do not make real network calls. — 0e2ea6f

#### Manual

- [x] 4.7 Test names cover the three selected risk states and fail-closed provider behavior. — 0e2ea6f
- [x] 4.8 The added test setup is minimal and does not introduce E2E/browser infrastructure. — 0e2ea6f
- [x] 4.9 The new CI command, if added to CI in Phase 5, is acceptable for normal PR runtime. — 0e2ea6f

### Phase 5: Config, Deployment Notes, And Handoff

#### Automated

- [x] 5.1 `npm run test` or `npm run test:safety` completes successfully. — c9e7532
- [x] 5.2 `npx astro sync` completes successfully. — c9e7532
- [x] 5.3 `npm run lint` completes successfully. — c9e7532
- [x] 5.4 `npm run build` completes successfully. — c9e7532
- [x] 5.5 `git diff --check` reports no whitespace errors. — c9e7532
- [x] 5.6 Source search finds no committed OpenRouter API key value. — c9e7532
- [x] 5.7 Source search confirms no S-04 chat/timer/session route was added. — c9e7532
- [x] 5.8 Source search confirms no code logs `prompt`, `message`, `content`, classifier input, or provider output from the safety boundary. — c9e7532

#### Manual

- [x] 5.9 `.env.example`, README, Wrangler config, GitHub Actions, and deploy plan agree on the OpenRouter secret contract. — c9e7532
- [x] 5.10 The deploy plan clearly states owner-owned OpenRouter key setup and no OpenRouter management key requirement. — c9e7532
- [x] 5.11 The F-02 handoff tells S-04 implementers to call `evaluateSessionSafety()` before ordinary AI generation. — c9e7532
- [x] 5.12 F-02 is still a foundation boundary and not a visible chat/session feature. — c9e7532
