---
change_id: voice-live-conversation
title: Voice conversation with GPT-Live-1
status: implemented
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Nie jest pozycją roadmapy. Decyzje właściciela z 2026-09-12: bramka bezpieczeństwa reaktywna, dostęp hybrydowy (jednorazowa próba 10 min dla free, miesięczna pula minut dla premium), EN i PL po pozytywnym spike'u. Etap 0 (`spike.md`) jest bramką przed etapem 1; S12 (obserwator w Durable Object przez 60 min) rozstrzyga wariant architektury.

Etapy 1–6 wdrożone 2026-09-12 na gałęzi `voice-live-conversation` z flagą `VOICE_SESSION_MODE=off` w `wrangler.jsonc` (wdrożenie „na ciemno”). Otwarte bramki manualne przed osobnym commitem przełączającym flagę: prawdziwe nagrania PL i odsłuch (S3), ZDR i region konta OpenAI w panelu (S6), telefony (S9), bieg obserwatora 60 min na runtime Cloudflare po `wrangler login` (S12/S13), odsłuch głosu `cedar`, lista manualna etapu 5 — wszystko w `verification.md`.
