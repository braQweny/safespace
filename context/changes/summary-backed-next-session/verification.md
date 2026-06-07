# Weryfikacja S-06: summary-backed next session

Data: 2026-06-07

## Lokalne komendy

| Check | Wynik | Uwagi |
| --- | --- | --- |
| `npm run test` | pass | Vitest: 29 plikow, 157 testow. |
| `npx astro sync` | pass | Typy wygenerowane. Vite uzyl portu inspectora 9230, bo 9229 byl zajety. |
| `npm run lint` | pass | ESLint zakonczyl sie kodem 0; parser Astro wypisal znane ostrzezenia o `projectService`. |
| `npm run build` | pass | Astro SSR server build dla `@astrojs/cloudflare` zakonczony sukcesem. Ostrzezenia: zajety port inspectora, CSS utility `[file:line]`, brak `site` dla sitemap. |
| `git diff --check` | pass | Brak whitespace errors. |

## Source sweeps

### Prywatne tabele

Komenda:

```bash
rg -n "\\.from\\([\\\"'](therapy_sessions|session_messages|session_summaries|session_trial_claims)[\\\"']\\)" src --glob '!src/lib/session-data/**'
```

Wynik: brak trafien. Direct access do prywatnych tabel pozostaje w `src/lib/session-data/`.

### Prywatne logowanie

Zakres sprawdzony: `src/pages/api/session/start-next.ts`, `src/pages/api/session/message.ts`, `src/pages/api/session/summary/`, `src/lib/session-summary/`, `src/lib/session-flow/session-summary.ts`.

Wynik: brak logowania raw `message`, `prompt`, `content`, `summaryText`, provider payloadow, Supabase/OpenRouter raw errorow, tokenow/cookies/hasel, raw `sessionId`, `modalityId`, `avatarId` albo `user.id`.

Znalezione logi operacyjne pozostaja na bezpiecznych eventach i metadanych: `status`, `reasonCode`, `durationMs`, `outcome`.

### Summary context

Zakres sprawdzony: `src/pages/api/session/message.ts`, `src/pages/api/session/start-next.ts`, `src/lib/session-ai/session-response-prompt.ts`, `src/lib/session-flow/session-state.ts`, `src/lib/session-flow/session-summary.ts`.

Wynik: follow-up i zwykla generacja uzywaja `listNewestApprovedSessionSummaryContexts()` dla poprzednich sesji. Prompt dostaje `approvedPriorSessionSummaries`, cap 3, i zachowuje oddzielnie `recentMessages` z aktywnej sesji. Raw poprzednie wiadomosci sa uzywane tylko do wygenerowania jawnego summary dla jednej owner-bound rozmowy.

### Scope creep

Zakres sprawdzony: `src/pages/api/session`, `src/components`, `src/lib/session-ai`, `src/lib/session-summary`, `src/lib/session-flow`.

Wynik: brak produkcyjnego kodu billing/payment/checkout/subscription/entitlement, admin private content access, summary edit forms/routes, trial reset, second free trial claim, streaming, `EventSource`, `WebSocket`, `ReadableStream` albo `text/event-stream`.

Jedno trafienie tekstu `reset trial` jest w nazwie testu `session-start-next-route.test.ts`, ktory potwierdza, ze follow-up nie resetuje trial state.

## Manual smoke

Status: confirmed by user in Phase 4 manual gate on 2026-06-07.

Potwierdzone:

- `/dashboard/avatar`: generate summary, retry failure state if mockable, preview, approval, stale/new revision behavior, absence of summary text in history list rows.
- `/dashboard/session`: first-trial start for fresh state albo zapis powodu, jesli lokalnie niedostepne.
- `/dashboard/session`: follow-up preparation, approved summary context display, explicit no-context fallback, follow-up start, visible timer, normal message, response-progress state.
- Delete regression: deleted summarized conversation no longer appears in future context.

## Hosted checks

Status: pending.

Nie uruchamiano hostowanych sprawdzen Supabase/OpenRouter/Cloudflare w tej fazie. Brakujace hosted checks maja pozostac oznaczone jako pending, dopoki nie zostana wykonane w srodowisku z odpowiednimi sekretami i zywym projektem.
