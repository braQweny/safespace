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

## Weryfikacja

Testy `__tests__/provider-routing.test.ts` przechodzą przez rzeczywiste fabryki, prompty, transporty i parsery z atrapą sieci: oba kierunki przełączenia, wszystkie ścieżki, formularz audio, brak klucza bez przełączenia i metadane. `openai/__tests__/chat.test.ts` sprawdza parametry, format JSON, błędy, niepełne odpowiedzi i przerwanie po czasie. Nie są to testy dostępności modeli ani konfiguracji konta OpenAI.
