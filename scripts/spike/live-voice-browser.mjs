#!/usr/bin/env node
/**
 * Etap 0 spike, część przeglądarkowa: lokalny serwer trzymający klucz OpenAI.
 * Serwuje stronę `live-voice-browser.html`, próbki PCM z `samples/`, tworzy sesję
 * GPT-Live przez `POST /v1/live/sessions` (oferta SDP z przeglądarki), wykonuje
 * `hangup`, krótkotrwałe komendy sideband (`/steer`), delegację kliencką przez
 * Chat Completions (`/delegate`) i zapisuje raporty do `out/<run>/`.
 *
 * Uruchomienie: node scripts/spike/live-voice-browser.mjs  → http://127.0.0.1:4390/
 * Klucz: OPENAI_API_KEY ze środowiska albo z `.env` w katalogu repo; nigdy nie jest wypisywany.
 */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const samplesDir = join(here, "samples");
const outRoot = join(here, "out");
const PORT = Number(process.env.SPIKE_PORT ?? 4390);
const API = "https://api.openai.com/v1";

async function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) {
    const line = (await readFile(envPath, "utf8")).split(/\r?\n/).find((l) => l.startsWith("OPENAI_API_KEY="));
    if (line) return line.slice("OPENAI_API_KEY=".length).trim().replace(/^"|"$/g, "");
  }
  console.error("Brak OPENAI_API_KEY — przerywam.");
  process.exit(2);
}
const key = await loadKey();
const backendModel = (process.env.OPENROUTER_SESSION_MODEL ?? "openai/gpt-5.6-luna").replace(/^openai\//, "");

function liveInstructions(lang, delegation) {
  const delegate =
    delegation === "none"
      ? ""
      : lang === "pl"
        ? "Każdą treściową odpowiedź deleguj do zaplecza; sam obsługuj tylko krótkie potwierdzenia."
        : "Delegate every substantive reply to the backend; handle only brief acknowledgements yourself.";
  return lang === "pl"
    ? `Jesteś Leną, spokojną rozmówczynią w edukacyjnej symulacji rozmowy wspierającej. Mów wyłącznie po polsku. Mów ciepło i naturalnie, w niespiesznym tempie, krótkimi zdaniami, bez list. Potwierdzaj z umiarem („mhm”, „rozumiem”), nie dominuj rozmowy. Gdy użytkownik przerywa, przestań mówić. Pauzy są częścią rozmowy: gdy użytkownik milknie w środku myśli, poczekaj kilka sekund, zanim cokolwiek powiesz. ${delegate} Zacznij od jednego krótkiego powitania i czekaj.`
    : `You are Lena, a calm companion in an educational supportive-conversation simulation. Speak only English. Speak warmly and naturally, at an unhurried pace, in short sentences, no lists. Acknowledge with moderation; do not dominate. Stop speaking when the user interrupts. Pauses are part of this conversation: when the user goes quiet mid-thought, wait a few seconds before saying anything. ${delegate} Open with one short greeting and wait.`;
}
function backendInstructions(lang) {
  return lang === "pl"
    ? "Jesteś Leną w edukacyjnej symulacji rozmowy wspierającej. Odpowiedzi są wypowiadane na głos: jedno do trzech krótkich zdań, bez list i formatowania, najwyżej jedno pytanie. Nie diagnozuj. Odzwierciedlaj to, co usłyszałaś, i pytaj o jedno."
    : "You are Lena in an educational supportive-conversation simulation. Replies are spoken aloud: one to three short sentences, no lists or formatting, at most one question. Do not diagnose. Reflect what you heard and ask about one thing.";
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function openaiPost(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text };
}

/** Krótkotrwały sideband: attach → komendy → czekaj na ack/odpowiedzi → close. */
function steer(liveSessionId, commands, waitMs = 4000) {
  return new Promise((done) => {
    const events = [];
    const t0 = Date.now();
    const ws = new WebSocket(`wss://api.openai.com/v1/live/sessions/${liveSessionId}/attach`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const finish = (note) => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      done({ note, events, ms: Date.now() - t0 });
    };
    ws.on("open", () => {
      events.push({ t: Date.now() - t0, type: "(open)" });
      for (const command of commands)
        ws.send(JSON.stringify({ event_id: `s_${Math.random().toString(36).slice(2, 8)}`, ...command }));
      setTimeout(() => finish("closed after wait"), waitMs);
    });
    ws.on("message", (data) => {
      const text = data.toString();
      let event;
      try {
        event = JSON.parse(text);
      } catch {
        return;
      }
      if (typeof event.type === "string" && /output_audio\.delta|input_audio\.append/.test(event.type)) return;
      events.push({ t: Date.now() - t0, ...event, delta: event.delta });
    });
    ws.on("unexpected-response", (req, res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => {
        req.destroy();
        finish(`HTTP ${res.statusCode} ${body.slice(0, 300)}`);
      });
    });
    ws.on("error", (error) => finish(`error ${error.message}`));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(here, "live-voice-browser.html")));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/samples/")) {
      const name = url.pathname.slice("/samples/".length);
      if (!/^[\w.-]+$/.test(name)) return sendJson(res, 400, { error: "bad name" });
      const file = await readFile(join(samplesDir, name));
      res.writeHead(200, { "Content-Type": name.endsWith(".json") ? "application/json" : "application/octet-stream" });
      res.end(file);
      return;
    }
    if (req.method === "POST" && url.pathname === "/session") {
      const {
        sdp,
        lang = "pl",
        delegation = "responses",
        voice = "marin",
        instructions,
        backend,
      } = await readJson(req);
      const session = {
        model: "gpt-live-1",
        store: false,
        instructions: instructions ?? liveInstructions(lang, delegation),
        audio: { output: { voice } },
        ...(delegation === "responses"
          ? {
              delegation: {
                type: "responses",
                responses: {
                  model: backend ?? backendModel,
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
      const result = await openaiPost("/live/sessions", { session, transport: { type: "webrtc", sdp } });
      console.log(
        `create: HTTP ${result.status} ${result.json?.session?.id ? `id ${result.json.session.id}` : result.text.slice(0, 200)}`,
      );
      return sendJson(res, result.status, result.json ?? { error: result.text.slice(0, 500) });
    }
    if (req.method === "POST" && url.pathname.startsWith("/hangup/")) {
      const id = url.pathname.slice("/hangup/".length);
      const result = await openaiPost(`/live/sessions/${id}/hangup`);
      console.log(`hangup ${id}: HTTP ${result.status}`);
      return sendJson(res, 200, { status: result.status, body: result.text.slice(0, 300) });
    }
    if (req.method === "POST" && url.pathname === "/steer") {
      const { id, commands, waitMs } = await readJson(req);
      const result = await steer(id, commands, waitMs);
      console.log(`steer ${id}: ${result.note} (${result.events.length} zdarzeń, ${result.ms} ms)`);
      return sendJson(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/delegate") {
      const { messages, lang = "pl" } = await readJson(req);
      const started = Date.now();
      const result = await openaiPost("/chat/completions", {
        model: backendModel,
        messages: [{ role: "system", content: backendInstructions(lang) }, ...messages],
        store: false,
        reasoning_effort: "low",
        max_completion_tokens: 600,
      });
      return sendJson(res, 200, {
        status: result.status,
        text: result.json?.choices?.[0]?.message?.content ?? "",
        ms: Date.now() - started,
      });
    }
    if (req.method === "POST" && url.pathname === "/report") {
      const report = await readJson(req);
      const run = String(report.run ?? Date.now()).replace(/[^\w-]/g, "-");
      const dir = join(outRoot, `browser-${run}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "events.jsonl"), (report.events ?? []).map((e) => JSON.stringify(e)).join("\n"));
      await writeFile(join(dir, "summary.json"), JSON.stringify({ ...report, events: undefined }, null, 2));
      console.log(`report → ${dir}`);
      return sendJson(res, 200, { dir });
    }
    if (req.method === "POST" && url.pathname.startsWith("/recording/")) {
      const run = url.pathname.slice("/recording/".length).replace(/[^\w-]/g, "-");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const dir = join(outRoot, `browser-${run}`);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "remote-audio.webm"), Buffer.concat(chunks));
      return sendJson(res, 200, { ok: true });
    }
    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    console.error(`błąd ${url.pathname}: ${error.message}`);
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`spike: http://127.0.0.1:${PORT}/  (zaplecze ${backendModel})`);
});
