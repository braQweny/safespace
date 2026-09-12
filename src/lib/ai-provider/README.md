# Dostawcy AI

`AI_PROVIDER=openai` wybiera bezpośrednie OpenAI dla wszystkich wywołań: rozmowy i powitania, bezpieczeństwo, soczewki, podsumowania, pamięć awatara, karty osób, mapa tematów i transkrypcja. Brak zmiennej oznacza OpenAI. `AI_PROVIDER=openrouter` przywraca OpenRouter. Nie ma automatycznego przełączania po błędzie ani po braku klucza.

## Konfiguracja

- `OPENAI_API_KEY`: klucz OpenAI, tylko na serwerze. Klucz OpenRouter nie działa w OpenAI.
- `OPENROUTER_API_KEY`: dotychczasowy, niezależny klucz; konfiguracja i SDK OpenRouter pozostają dostępne.
- Istniejące `OPENROUTER_SESSION_MODEL`, `OPENROUTER_SAFETY_MODEL`, `OPENROUTER_SUMMARY_MODEL`, `OPENROUTER_TRANSCRIPTION_MODEL` i `OPENROUTER_SESSION_REASONING_EFFORT` są używane przez obu dostawców. Nie trzeba ich przepisywać. Adapter OpenAI usuwa tylko prefiks `openai/`; odrzuca identyfikatory innych dostawców i warianty OpenRouter z dwukropkiem.
- Lokalnie ustaw `AI_PROVIDER` i właściwy klucz w `.env` oraz `.dev.vars`. Gdy istnieje `.dev.vars`, Wrangler używa go zamiast `.env`. Po zmianie uruchom ponownie serwer.
- Produkcja: wybór dostawcy jest w `wrangler.jsonc`; klucz pochodzi z GitHub Secrets. `scripts/write-production-secrets.mjs` sprawdza klucz wybranego dostawcy przed migracjami, zapisuje dostępne sekrety do tymczasowego pliku i nie wypisuje ich wartości. Nie deklarujemy `secrets.required`, ponieważ Wrangler odfiltrowuje wtedy lokalne sekrety spoza tej listy, a wymagany klucz zależy od dostawcy.

## Transport i prywatność

Wspólne generatory używają dotychczasowych promptów i parserów. Eksporty `WithOpenRouter` nadal jawnie wybierają OpenRouter; główne fabryki używają wybranego dostawcy. Typy żądań i walidacja odpowiedzi pozostają zgodne z istniejącym SDK, lecz transport OpenAI wysyła żądania wyłącznie do `api.openai.com`.

Oba transporty OpenAI ustawiają `redirect: "manual"` i odrzucają odpowiedzi 3xx, bez przesyłania klucza lub treści pod adres przekierowania. Używany lokalnie runtime Cloudflare (`workerd`) odrzuca tryb `redirect: "error"`, mimo że działa on w testach Node.

OpenAI używa [Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) z `store: false`, bez routingu OpenRouter, narzędzi, identyfikatorów użytkownika i dodatkowych metadanych. Luna nie przyjmuje natywnego `minimal`: adapter mapuje je na `low`, zwiększając limit klasyfikatora z 256 do 1024 tokenów, by uwzględnić rozumowanie. Rozmowa zachowuje ustawione `xhigh`, a powitanie i podsumowanie `low`. [Parametry Luny](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

`store: false` nie jest gwarancją ZDR. Retencja monitorowania nadużyć i uprawnienia ZDR zależą od konta/projektu OpenAI; nie da się ich wymusić parametrem routingu OpenRouter. Przed użyciem rzeczywistych rozmów sprawdź ustawienia konta. [Kontrola danych OpenAI](https://developers.openai.com/api/docs/guides/your-data).

OpenRouter zachowuje `dataCollection: deny`, `requireParameters: true`, `zdr: true` i preferencję `azure/eu` dla bazowej Luny. OpenAI nie korzysta z tej preferencji regionu. Transkrypcja OpenAI używa bezpośrednio formularza multipart z plikiem WebM i językiem `en`/`pl`; nie tworzy pliku w Files API. SafeSpace nie zapisuje nagrań. Błędy obu transportów są redukowane do zamkniętych kategorii, bez treści, kluczy i payloadów. Niepełne, odrzucone i niepoprawne odpowiedzi nie są zapisywane jako odpowiedzi awatara.

## Transport Live (GPT-Live-1, rozmowa głosowa)

Rozmowa głosowa używa modelu `gpt-live-1` przez rodzinę `v1/live/sessions`, nie przez Chat Completions, więc `sendAiChat` jej nie obsługuje. Transport to `src/lib/openai/live.ts`: `createLiveSession` (REST z ofertą SDP przeglądarki, odpowiedź SDP i identyfikator sesji, który żyje wyłącznie w obserwatorze), `hangupLiveSession` i `openLiveSideband` (WebSocket `attach` z Bearer). Działa **tylko** przy `AI_PROVIDER=openai` — GPT-Live nie ma trasy w OpenRouter, więc `isVoiceStartAvailable()` gasi start głosowy dla alternatywnego dostawcy, a klucz `sk-or-` jest odrzucany jak w `chat.ts`. Transport WebSocket `/v1/live` jest alfą niedostępną dla projektu (spike S5) i nie jest planowany.

Konfiguracja sesji (`buildLiveSessionConfig` w `session-ai/voice-instructions.ts`): instrukcje warstwy mówionej w języku rozmowy, głos per awatar (`liveVoice` z listy `OPENAI_LIVE_VOICES`), delegacja `responses` do Luny (`OPENROUTER_SESSION_MODEL` bez prefiksu, `reasoning.effort: low`, `max_output_tokens` 1600) z instrukcjami zaplecza równymi treści systemowej rozmowy pisanej plus ogrodzony `<<<recap>>>` ostatnich tur, oraz `store: false` — nigdy `store: true`, bo audio wyjściowe byłoby wtedy przechowywane u dostawcy 30 dni. `store: false` nie jest ZDR: sesje live są ZDR-eligible, ale zerowa retencja i region przetwarzania (istnieje `eu.api.openai.com`; transport używa `api.openai.com`) są ustawieniami konta OpenAI i muszą być potwierdzone w panelu przed przełączeniem `VOICE_SESSION_MODE` (spike S6). Dźwięk płynie bezpośrednio między przeglądarką a OpenAI (WebRTC); Worker widzi tylko SDP i transkrypt z sideband, nigdy audio. Klasyfikator w obserwatorze używa `createOpenAiSafetyProvider` z kluczem i modelem z `env` Workera — ten sam builder żądania co w rozmowie pisanej, bez `astro:env/server`.

Błędy transportu są redukowane do tych samych zamkniętych kategorii co Chat Completions (`OpenAiLiveError`), bez treści, kluczy, SDP i identyfikatorów w logach; trasa `connect` loguje `session.voice_connected` z wynikiem, czasem i kodem porażki.

## Weryfikacja

Testy `__tests__/provider-routing.test.ts` przechodzą przez rzeczywiste fabryki, prompty, transporty i parsery z atrapą sieci: oba kierunki przełączenia, wszystkie ścieżki, formularz audio, brak klucza bez przełączenia i metadane. `openai/__tests__/chat.test.ts` sprawdza parametry, format JSON, błędy, niepełne odpowiedzi i przerwanie po czasie. `openai/__tests__/live.test.ts` sprawdza tworzenie sesji, `hangup`, sideband z ack i mapowanie błędów na atrapie sieci; `provider-routing.test.ts` pilnuje, że sesja live idzie wprost do `api.openai.com` i odrzuca klucz OpenRouter. Nie są to testy dostępności modeli ani konfiguracji konta OpenAI.
