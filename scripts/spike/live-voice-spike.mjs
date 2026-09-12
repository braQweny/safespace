#!/usr/bin/env node
/**
 * Etap 0 spike dla GPT-Live-1 (rozmowa głosowa). Skrypt jednorazowy, poza aplikacją:
 * nie importuje niczego z `src/`, klucz bierze wyłącznie ze środowiska (albo z `.env`
 * w katalogu repo, jeśli zmienna nie jest ustawiona) i nigdy go nie wypisuje.
 *
 * Podkomendy:
 *   probe-config            S5: które pola `session.start` OpenAI przyjmuje (store, głos, delegacja, nieznane pole)
 *   probe-create            S1: kształt `POST /v1/live/sessions` dla WebRTC (błędy walidacji zdradzają schemat)
 *   tts                     generuje polskie próbki PCM16 24 kHz przez TTS do scripts/spike/samples/
 *   converse [opcje]        S2/S3/S4/S8/S10/S11: streamuje próbki, zbiera zdarzenia, mierzy latencje, zapisuje audio
 *   hangup <sessionId>      S7: REST hangup (uruchom dwa razy, żeby sprawdzić idempotencję)
 *
 * Opcje `converse`:
 *   --samples 01,02          które próbki (domyślnie wszystkie z manifestu)
 *   --delegation responses|client|none   (domyślnie responses)
 *   --gap-ms 4000            cisza po każdej próbce (dla par „pauza w zdaniu" użyj 1500 / 3000)
 *   --sideband               podłącz drugi WebSocket (attach) i loguj jego zdarzenia
 *   --interrupt-at 2         przy K-tej odpowiedzi modelu wyślij po sideband `instructions.append` „przerwij"
 *   --mute-test              po pierwszej próbce wycisz wejście po sideband i wyślij drugą (oczekiwane: brak input transcript)
 *   --close-via primary|sideband|hangup   (domyślnie primary)
 *   --voice marin            głos wyjściowy
 *   --lang pl|en             język instrukcji warstwy live (domyślnie pl)
 *
 * Wyjścia lądują w scripts/spike/out/<run>/ (events.jsonl, transcript.txt, output.wav, summary.json).
 */
import { WebSocket } from "ws";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const samplesDir = join(here, "samples");
const outRoot = join(here, "out");

const API = "https://api.openai.com/v1";
const LIVE_WS_URL = "wss://api.openai.com/v1/live";
// Upgrade wymaga modelu w query (błąd: query parameter "model" must be provided exactly once).
const LIVE_WS_PRIMARY_URL = `${LIVE_WS_URL}?model=${encodeURIComponent("gpt-live-1")}`;
const LIVE_MODEL = "gpt-live-1";
const LIVE_ALPHA_HEADER = "quicksilver=v2";
const SAMPLE_RATE = 24_000;
const CHUNK_MS = 100;
const CHUNK_BYTES = (SAMPLE_RATE * 2 * CHUNK_MS) / 1000;

// ---------- env ----------

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) {
    const text = await readFile(envPath, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
    if (line) return line.slice("OPENAI_API_KEY=".length).trim().replace(/^"|"$/g, "");
  }
  console.error("Brak OPENAI_API_KEY w środowisku ani w .env — przerywam.");
  process.exit(2);
}

function backendModel() {
  const raw = process.env.OPENROUTER_SESSION_MODEL ?? "openai/gpt-5.6-luna";
  return raw.replace(/^openai\//, "");
}

// ---------- helpers ----------

const now = () => performance.now();

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        opts[key] = next;
        i += 1;
      } else {
        opts[key] = true;
      }
    } else {
      opts._.push(arg);
    }
  }
  return opts;
}

function eventId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function wavHeader(pcmBytes) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBytes, 40);
  return header;
}

function openSocket(url, key) {
  return new Promise((resolveSocket, reject) => {
    // /v1/live odrzuca upgrade bez tego nagłówka alfa (HTTP 400 invalid_websocket_query).
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${key}`, "OpenAI-Alpha": LIVE_ALPHA_HEADER },
    });
    socket.once("open", () => resolveSocket(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        // Bez destroy odrzucone żądanie trzyma pętlę zdarzeń i proces nigdy nie kończy.
        req.destroy();
        reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 500)}`));
      });
    });
  });
}

function send(socket, payload) {
  socket.send(JSON.stringify(payload));
}

function waitFor(socket, predicate, timeoutMs) {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error(`timeout ${timeoutMs} ms`));
    }, timeoutMs);
    function onMessage(data) {
      let event;
      try {
        event = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (predicate(event)) {
        clearTimeout(timer);
        socket.off("message", onMessage);
        resolveEvent(event);
      }
    }
    socket.on("message", onMessage);
  });
}

function typeEndsWith(event, suffix) {
  return typeof event?.type === "string" && (event.type === suffix || event.type.endsWith(`.${suffix}`));
}

// ---------- probe-config (S5) ----------

async function probeConfig(key) {
  const backend = backendModel();
  const candidates = [
    ["minimal", { model: LIVE_MODEL }],
    ["store:false", { model: LIVE_MODEL, store: false }],
    ["audio.output.voice (Azure shape)", { model: LIVE_MODEL, audio: { output: { voice: "marin" } } }],
    ["audio.voice (reference shape)", { model: LIVE_MODEL, audio: { voice: "marin" } }],
    ["invalid voice → lista głosów?", { model: LIVE_MODEL, audio: { output: { voice: "__not_a_voice__" } } }],
    ["instructions PL", { model: LIVE_MODEL, instructions: "Mów po polsku. Odpowiadaj krótko." }],
    [
      "delegation responses (Luna, low)",
      {
        model: LIVE_MODEL,
        delegation: {
          type: "responses",
          responses: {
            model: backend,
            instructions: "Odpowiadaj po polsku jednym zdaniem.",
            reasoning: { effort: "low" },
            max_output_tokens: 300,
          },
        },
      },
    ],
    ["delegation client", { model: LIVE_MODEL, delegation: { type: "client" } }],
    ["transcription {}", { model: LIVE_MODEL, transcription: {} }],
    ["unknown field (strict?)", { model: LIVE_MODEL, definitely_unknown_field: true }],
    ["input_audio.format pcm 24k", { model: LIVE_MODEL, input_audio: { format: { type: "audio/pcm", rate: 24_000 } } }],
  ];

  for (const [label, session] of candidates) {
    let socket;
    try {
      socket = await openSocket(LIVE_WS_PRIMARY_URL, key);
      send(socket, { type: "session.start", event_id: eventId("start"), session });
      const event = await waitFor(socket, (e) => typeEndsWith(e, "session.started") || e.type === "error", 10_000);
      if (event.type === "error") {
        console.log(`✗ ${label}\n    ${JSON.stringify(event).slice(0, 700)}`);
      } else {
        console.log(`✓ ${label}\n    session=${JSON.stringify(event.session ?? {}).slice(0, 700)}`);
        send(socket, { type: "session.close", event_id: eventId("close") });
        await waitFor(socket, (e) => typeEndsWith(e, "session.closed"), 10_000).catch(() => null);
      }
    } catch (error) {
      console.log(`! ${label}: ${error.message}`);
    } finally {
      socket?.close();
    }
  }
}

// ---------- probe-create (S1) ----------

async function probeCreate(key) {
  const fakeSdp =
    "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nc=IN IP4 0.0.0.0\r\na=rtpmap:111 opus/48000/2\r\n";
  const bodies = [
    ["session only", { session: { model: LIVE_MODEL } }],
    [
      "session + transport.webrtc.sdp",
      { session: { model: LIVE_MODEL, store: false }, transport: { type: "webrtc", sdp: fakeSdp } },
    ],
    ["transport.sdp bez type", { session: { model: LIVE_MODEL }, transport: { sdp: fakeSdp } }],
  ];
  for (const [label, body] of bodies) {
    const response = await fetch(`${API}/live/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    console.log(`${label}: HTTP ${response.status}\n    ${text.slice(0, 900)}`);
    try {
      const parsed = JSON.parse(text);
      const id = parsed?.session?.id ?? parsed?.id;
      if (response.ok && id) {
        console.log(`    (utworzono sesję ${id} — rozłączam przez hangup)`);
        await hangup(key, id);
      }
    } catch {
      /* not JSON */
    }
  }
}

// ---------- tts (próbki PL) ----------

const PL_SAMPLES = [
  ["01-diakrytyki", "Cześć. Ostatnio źle sypiam, bo ciągle myślę o rozmowie z mamą. Chciałabym to jakoś uporządkować."],
  [
    "02-imiona-liczby",
    "Marta i Grzegorz kłócą się od trzech tygodni, a ja stoję pomiędzy nimi. W piątek o dziewiętnastej mamy się spotkać.",
  ],
  [
    "03-szybko",
    "Nie wiem od czego zacząć bo wszystko dzieje się naraz praca dom rodzice i jeszcze ten remont który miał trwać dwa tygodnie.",
  ],
  ["04-emocje", "Wstydzę się tego, ale czasem po prostu chce mi się płakać bez powodu. I nie mówię o tym nikomu."],
  ["05-pauza-a", "Wczoraj wieczorem, kiedy wróciłem do domu,"],
  ["05-pauza-b", "zobaczyłem, że ona już spakowała walizkę."],
  ["06-pytanie", "Czy to normalne, że boję się odebrać telefon od własnego brata?"],
  ["07-krotko", "Mhm. Tak. Chyba tak."],
  ["08-nazwy", "Pracuję w Łodzi, ale dojeżdżam z Pabianic. Mój szef, pan Wróblewski, wysyła maile o północy."],
  ["09-negacja", "Nie chodzi o to, że nie chcę. Chodzi o to, że nie potrafię powiedzieć nie."],
  ["10-kryzys-test", "Czasem myślę, że wszystkim byłoby lżej, gdyby mnie nie było."],
];

async function tts(key) {
  await mkdir(samplesDir, { recursive: true });
  const manifest = [];
  for (const [id, text] of PL_SAMPLES) {
    const response = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.SPIKE_TTS_MODEL ?? "gpt-4o-mini-tts",
        voice: process.env.SPIKE_TTS_VOICE ?? "alloy",
        input: text,
        response_format: "pcm",
        instructions:
          "Mów naturalnie po polsku, spokojnym, nieco zmęczonym tonem, jak osoba zwierzająca się w rozmowie.",
      }),
    });
    if (!response.ok) {
      console.error(`TTS ${id}: HTTP ${response.status} ${(await response.text()).slice(0, 400)}`);
      continue;
    }
    const pcm = Buffer.from(await response.arrayBuffer());
    await writeFile(join(samplesDir, `${id}.pcm`), pcm);
    manifest.push({ id, text, bytes: pcm.length, seconds: pcm.length / (SAMPLE_RATE * 2) });
    console.log(`✓ ${id} (${(pcm.length / (SAMPLE_RATE * 2)).toFixed(1)} s)`);
  }
  await writeFile(join(samplesDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`manifest: ${manifest.length} próbek → ${join(samplesDir, "manifest.json")}`);
}

// ---------- converse (S2/S3/S4/S8/S10/S11) ----------

function liveInstructions(lang, backendMode) {
  const delegationLine =
    backendMode === "none"
      ? ""
      : lang === "pl"
        ? "Każdą treściową odpowiedź deleguj do zaplecza; sam obsługuj tylko krótkie potwierdzenia."
        : "Delegate every substantive reply to the backend; handle only brief acknowledgements yourself.";
  return lang === "pl"
    ? [
        "Jesteś Leną, spokojną rozmówczynią w edukacyjnej symulacji rozmowy wspierającej. Mów wyłącznie po polsku.",
        "Mów ciepło i naturalnie, w niespiesznym tempie, krótkimi zdaniami. Nie używaj list ani formatowania.",
        "Potwierdzaj z umiarem („mhm”, „rozumiem”), nie dominuj rozmowy.",
        "Gdy użytkownik przerywa, przestań mówić. Pauzy są częścią rozmowy: gdy użytkownik milknie w środku myśli, poczekaj kilka sekund, zanim cokolwiek powiesz.",
        delegationLine,
        "Zacznij od jednego krótkiego powitania i czekaj.",
      ]
        .filter(Boolean)
        .join(" ")
    : [
        "You are Lena, a calm companion in an educational conversation simulation. Speak only English.",
        "Speak warmly and naturally, at an unhurried pace, in short sentences. No lists or formatting.",
        "Acknowledge with moderation; do not dominate the conversation.",
        "Stop speaking when the user interrupts. Pauses are part of this conversation: when the user goes quiet mid-thought, wait a few seconds before saying anything.",
        delegationLine,
        "Open with one short greeting and wait.",
      ]
        .filter(Boolean)
        .join(" ");
}

function backendInstructions(lang) {
  return lang === "pl"
    ? "Jesteś Leną w edukacyjnej symulacji rozmowy wspierającej. Odpowiedzi są wypowiadane na głos: jedno do trzech krótkich zdań, bez list i formatowania, najwyżej jedno pytanie. Nie diagnozuj. Odzwierciedlaj to, co usłyszałaś, i pytaj o jedno."
    : "You are Lena in an educational supportive-conversation simulation. Replies are spoken aloud: one to three short sentences, no lists or formatting, at most one question. Do not diagnose. Reflect what you heard and ask about one thing.";
}

async function chatCompletion(key, messages) {
  const started = now();
  const response = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: backendModel(),
      messages,
      store: false,
      reasoning_effort: "low",
      max_completion_tokens: 600,
    }),
  });
  const json = await response.json();
  return { text: json?.choices?.[0]?.message?.content ?? "", ms: now() - started, status: response.status };
}

async function converse(key, opts) {
  const lang = opts.lang ?? "pl";
  const delegation = opts.delegation ?? "responses";
  const gapMs = Number(opts["gap-ms"] ?? 4000);
  const closeVia = opts["close-via"] ?? "primary";
  const interruptAt = opts["interrupt-at"] ? Number(opts["interrupt-at"]) : null;
  const manifest = JSON.parse(await readFile(join(samplesDir, "manifest.json"), "utf8"));
  const wanted = opts.samples ? String(opts.samples).split(",") : manifest.map((m) => m.id.slice(0, 2));
  const samples = manifest.filter((m) => wanted.includes(m.id.slice(0, 2)) || wanted.includes(m.id));
  if (samples.length === 0) throw new Error("brak próbek — uruchom najpierw `tts`");

  const run = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(outRoot, run);
  await mkdir(outDir, { recursive: true });
  const events = [];
  const t0 = now();
  const log = (src, event, extra = {}) => {
    const record = { t: Math.round(now() - t0), src, type: event.type, ...extra };
    events.push({ ...record, raw: event });
    if (!typeEndsWith(event, "output_audio.delta") && !typeEndsWith(event, "input_audio.append")) {
      console.log(
        `${String(record.t).padStart(7)} ${src.padEnd(8)} ${event.type}${extra.note ? `  ${extra.note}` : ""}`,
      );
    }
  };

  const session = {
    model: LIVE_MODEL,
    store: false,
    instructions: liveInstructions(lang, delegation),
    audio: { output: { voice: opts.voice ?? "marin" } },
    ...(delegation === "responses"
      ? {
          delegation: {
            type: "responses",
            responses: {
              model: backendModel(),
              instructions: backendInstructions(lang),
              reasoning: { effort: "low" },
              max_output_tokens: 400,
            },
          },
        }
      : delegation === "client"
        ? { delegation: { type: "client" } }
        : {}),
  };

  const primary = await openSocket(LIVE_WS_PRIMARY_URL, key);
  const outputPcm = [];
  const transcript = [];
  let liveSessionId = null;
  let speechEndAt = null;
  let inGapUntil = null;
  let firstAudioAfterSpeech = null;
  const latencies = [];
  let replyCount = 0;
  let lastOutputAt = null;
  const summary = { run, lang, delegation, gapMs, samples: samples.map((s) => s.id), notes: [] };
  const conversationForClient = [{ role: "system", content: backendInstructions(lang) }];
  let userSoFar = "";

  const handle = (src) => async (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (typeEndsWith(event, "output_audio.delta")) {
      if (src === "primary") {
        outputPcm.push(Buffer.from(event.delta ?? event.audio ?? "", "base64"));
        const t = now();
        if (lastOutputAt === null || t - lastOutputAt > 1500) {
          replyCount += 1;
          log(src, { type: "(reply-start)" }, { note: `reply #${replyCount}` });
          if (interruptAt === replyCount && sideband) {
            const id = eventId("interrupt");
            send(sideband, {
              type: "session.instructions.append",
              event_id: id,
              delegation_id: null,
              content:
                lang === "pl"
                  ? "Natychmiast przestań mówić i milcz, dopóki użytkownik nie odezwie się ponownie."
                  : "Stop speaking immediately and stay silent until the user speaks again.",
            });
            summary.interruptSentAt = Math.round(t - t0);
            log("sideband", { type: "(sent) session.instructions.append" }, { note: "interrupt" });
          }
        }
        lastOutputAt = t;
        if (speechEndAt !== null && firstAudioAfterSpeech === null) {
          firstAudioAfterSpeech = t;
          const latency = Math.round(t - speechEndAt);
          latencies.push(latency);
          log(src, { type: "(latency)" }, { note: `first audio ${latency} ms after speech end` });
        }
        if (inGapUntil !== null && t < inGapUntil) {
          summary.notes.push(
            `audio during pause gap at t=${Math.round(t - t0)} (gap ends ${Math.round(inGapUntil - t0)})`,
          );
        }
      }
      return;
    }
    const isInput = typeEndsWith(event, "input_transcript.delta");
    const isOutput = typeEndsWith(event, "output_transcript.delta");
    if (isInput || isOutput) {
      if (src === "primary") {
        transcript.push({
          t: Math.round(now() - t0),
          speaker: isInput ? "user" : "assistant",
          delta: event.delta,
          start_ms: event.start_ms,
          end_ms: event.end_ms,
        });
        if (isInput) userSoFar += event.delta;
      }
      log(src, event, { note: `[${event.start_ms}–${event.end_ms}] ${JSON.stringify(event.delta)}` });
      return;
    }
    log(src, event, { note: JSON.stringify(event).slice(0, 300) });
    if (typeEndsWith(event, "session.started") && src === "primary") {
      liveSessionId = event.session?.id ?? null;
    }
    if (typeEndsWith(event, "delegation.created") && src === "primary" && delegation === "client") {
      const delegationId = event.delegation?.id;
      conversationForClient.push({ role: "user", content: userSoFar || "(nic nie zrozumiano)" });
      userSoFar = "";
      const reply = await chatCompletion(key, conversationForClient);
      conversationForClient.push({ role: "assistant", content: reply.text });
      summary.clientDelegations = summary.clientDelegations ?? [];
      summary.clientDelegations.push({ chatMs: Math.round(reply.ms), status: reply.status, chars: reply.text.length });
      send(primary, {
        type: "session.commentary.append",
        event_id: eventId("commentary"),
        delegation_id: delegationId,
        content: reply.text.slice(0, 1500),
      });
      log("primary", { type: "(sent) session.commentary.append" }, { note: `chat ${Math.round(reply.ms)} ms` });
    }
  };

  primary.on("message", handle("primary"));
  send(primary, { type: "session.start", event_id: eventId("start"), session });
  const started = await waitFor(primary, (e) => typeEndsWith(e, "session.started") || e.type === "error", 15_000);
  if (started.type === "error") throw new Error(`session.start rejected: ${JSON.stringify(started)}`);
  liveSessionId = liveSessionId ?? started.session?.id ?? null;
  summary.liveSessionId = liveSessionId;

  let sideband = null;
  if (opts.sideband && liveSessionId) {
    const attachStarted = now();
    sideband = await openSocket(`${LIVE_WS_URL}/sessions/${liveSessionId}/attach`, key);
    summary.sidebandOpenMs = Math.round(now() - attachStarted);
    sideband.on("message", handle("sideband"));
    log("sideband", { type: "(open)" }, { note: `${summary.sidebandOpenMs} ms` });
  }

  // Pozwól modelowi wypowiedzieć powitanie.
  await new Promise((r) => setTimeout(r, 4000));

  const silence = Buffer.alloc(CHUNK_BYTES).toString("base64");
  const streamPcm = async (pcm) => {
    let offset = 0;
    let next = now();
    while (offset < pcm.length) {
      const chunk = pcm.subarray(offset, offset + CHUNK_BYTES);
      send(primary, {
        type: "session.input_audio.append",
        event_id: eventId("audio"),
        audio: chunk.toString("base64"),
      });
      offset += CHUNK_BYTES;
      next += CHUNK_MS;
      const wait = next - now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  };
  const streamSilence = async (ms) => {
    let next = now();
    const until = next + ms;
    while (now() < until) {
      send(primary, { type: "session.input_audio.append", event_id: eventId("silence"), audio: silence });
      next += CHUNK_MS;
      const wait = next - now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  };

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const pcm = await readFile(join(samplesDir, `${sample.id}.pcm`));
    if (opts["mute-test"] && index === 1 && sideband) {
      send(sideband, { type: "session.input_audio.mute", event_id: eventId("mute"), delegation_id: null });
      log("sideband", { type: "(sent) session.input_audio.mute" });
      await new Promise((r) => setTimeout(r, 500));
    }
    log("primary", { type: "(sample-start)" }, { note: `${sample.id}: ${sample.text}` });
    speechEndAt = null;
    firstAudioAfterSpeech = null;
    await streamPcm(pcm);
    speechEndAt = now();
    const isPauseHalf = sample.id.endsWith("-a");
    inGapUntil = isPauseHalf ? now() + gapMs : null;
    log(
      "primary",
      { type: "(sample-end)" },
      { note: isPauseHalf ? `pauza w zdaniu ${gapMs} ms` : `cisza ${gapMs} ms` },
    );
    await streamSilence(gapMs);
    inGapUntil = null;
    if (opts["mute-test"] && index === 1 && sideband) {
      send(sideband, { type: "session.input_audio.unmute", event_id: eventId("unmute"), delegation_id: null });
      log("sideband", { type: "(sent) session.input_audio.unmute" });
    }
  }
  await streamSilence(6000);

  if (closeVia === "hangup" && liveSessionId) {
    summary.hangup = [await hangup(key, liveSessionId), await hangup(key, liveSessionId)];
  } else {
    const closer = closeVia === "sideband" && sideband ? sideband : primary;
    send(closer, { type: "session.close", event_id: eventId("close") });
  }
  const closed = await waitFor(primary, (e) => typeEndsWith(e, "session.closed"), 15_000).catch(() => null);
  summary.closed = closed ? { reason: closed.reason, usage: closed.usage } : "no session.closed on primary";
  primary.close();
  sideband?.close();

  summary.latenciesMs = latencies;
  summary.replyCount = replyCount;
  summary.transcript = transcript;
  const pcmOut = Buffer.concat(outputPcm);
  await writeFile(join(outDir, "output.wav"), Buffer.concat([wavHeader(pcmOut.length), pcmOut]));
  await writeFile(join(outDir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"));
  await writeFile(
    join(outDir, "transcript.txt"),
    transcript
      .map((t) => `${String(t.t).padStart(7)} ${t.speaker.padEnd(9)} [${t.start_ms}-${t.end_ms}] ${t.delta}`)
      .join("\n"),
  );
  await writeFile(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(
    `\n== ${run} ==\nlatencje (ms): ${latencies.join(", ") || "brak"}\nodpowiedzi: ${replyCount}\nclosed: ${JSON.stringify(summary.closed)}\nnotatki: ${summary.notes.join(" | ") || "brak"}\nwyjścia: ${outDir}`,
  );
}

// ---------- hangup (S7) ----------

async function hangup(key, sessionId) {
  const response = await fetch(`${API}/live/sessions/${sessionId}/hangup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await response.text();
  console.log(`hangup ${sessionId}: HTTP ${response.status} ${text.slice(0, 300)}`);
  return { status: response.status, body: text.slice(0, 300) };
}

// ---------- main ----------

const opts = parseArgs(process.argv.slice(2));
const command = opts._[0];
const key = await loadKey();
switch (command) {
  case "probe-config":
    await probeConfig(key);
    break;
  case "probe-create":
    await probeCreate(key);
    break;
  case "tts":
    await tts(key);
    break;
  case "converse":
    await converse(key, opts);
    break;
  case "hangup":
    await hangup(key, opts._[1]);
    break;
  default:
    console.log(
      "użycie: node scripts/spike/live-voice-spike.mjs <probe-config|probe-create|tts|converse|hangup> [opcje]",
    );
    process.exit(1);
}
// Gniazda po odrzuconym upgrade mogą wisieć; kończymy jawnie, żeby wyjście zostało spuszczone do potoku.
process.exit(0);
