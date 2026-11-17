// Machine homologation for the voice pipeline. It calls the real Gemini API,
// so it is not part of the default test suite. Usage:
//   node scripts/voice-homologation.mjs [--pause=1200] [--out=path.json]
// Speech is synthesized with Gemini TTS from fictitious sentences only.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).map((item) => item.replace(/^--/, "").split("=")));
const pauseMs = Number(args.pause ?? 1200);
const out = args.out ?? null;
const env = Object.fromEntries(readFileSync(`${root}.env.local`, "utf8").split("\n")
  .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
  .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]));
const key = env.CBB_INTELLIGENCE_API_KEY;
if (!key) throw new Error("CBB_INTELLIGENCE_API_KEY is required in .env.local");
const setup = JSON.parse(readFileSync(`${root}src/features/chat/voice/live-setup.json`, "utf8"));
const cacheDir = "/tmp/cbb-voice-cache";
mkdirSync(cacheDir, { recursive: true });

const script = [
  ["Abra a Lara Menezes."],
  ["Quais foram as últimas evoluções dela?"],
  ["E nos últimos seis meses?"],
  ["Agora veja a fisioterapia."],
  ["E o que mudou depois da entorse de tornozelo direito?"],
  ["Ela nega dor noturna e não teve edema."],
  ["Usou dipirona quinhentos miligramas de oito em oito horas por três dias."],
  ["O teste de gaveta anterior foi negativo no joelho esquerdo."],
  ["O atendimento foi em dez de novembro de dois mil e vinte e seis."],
  ["Atleta relata melhora da dorsiflexão,", "mantém bandagem funcional e crioterapia após o treino."],
  ["Faça uma evolução com essas informações."],
  ["Pode salvar isso."],
];
// The service writes numbers as digits, which is the expected clinical form.
const written = {
  6: "Usou dipirona 500 mg de 8 em 8 horas por 3 dias.",
  8: "O atendimento foi em 10 de novembro de 2026.",
};

const ttsModels = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];
let ttsModel = 0;

async function speech(text, attempt = 0) {
  const file = `${cacheDir}/${createHash("sha256").update(text).digest("hex").slice(0, 16)}.pcm`;
  if (existsSync(file)) return readFileSync(file);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ttsModels[ttsModel]}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    }),
  });
  if (response.status === 429 && attempt < 12) {
    const detail = JSON.stringify(await response.json().catch(() => ({})));
    if (detail.includes("PerDay") && ttsModel < ttsModels.length - 1) {
      ttsModel += 1;
      console.log(`TTS daily quota reached, switching to ${ttsModels[ttsModel]}`);
      return speech(text, attempt + 1);
    }
    console.log("TTS rate limited, waiting 25 s");
    await wait(25_000);
    return speech(text, attempt + 1);
  }
  if (!response.ok) throw new Error(`TTS failed with ${response.status}`);
  const body = await response.json();
  const part = body.candidates?.[0]?.content?.parts?.find((item) => item.inlineData);
  if (!part) throw new Error("TTS returned no audio");
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1] ?? 24000);
  const pcm = resample(new Int16Array(Buffer.from(part.inlineData.data, "base64").buffer.slice(0)), rate, 16000);
  const bytes = Buffer.from(pcm.buffer);
  writeFileSync(file, bytes);
  return bytes;
}

function resample(input, from, to) {
  if (from === to) return input;
  const length = Math.floor(input.length * to / from);
  const output = new Int16Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * from / to;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    output[index] = Math.round(input[left] + (input[right] - input[left]) * (position - left));
  }
  return output;
}

const noise = Number(args.noise ?? 0);
let seed = 7;
function random() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function withNoise(buffer) {
  if (!noise) return buffer;
  const samples = new Int16Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.max(-32768, Math.min(32767, samples[index] + (random() * 2 - 1) * noise * 32767));
  }
  return Buffer.from(samples.buffer);
}
const silence = (ms) => withNoise(Buffer.alloc(Math.round(16000 * ms / 1000) * 2));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function wordErrorRate(expected, actual) {
  const a = normalize(expected).split(" ");
  const b = normalize(actual).split(" ").filter(Boolean);
  const table = Array.from({ length: a.length + 1 }, (_, row) => [row, ...Array(b.length).fill(0)]);
  for (let column = 1; column <= b.length; column += 1) table[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      table[row][column] = Math.min(table[row - 1][column] + 1, table[row][column - 1] + 1, table[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
    }
  }
  return table[a.length][b.length] / a.length;
}

const audio = [];
for (const segments of script) {
  const parts = [];
  for (const segment of segments) parts.push(withNoise(await speech(segment)));
  audio.push(parts);
}

const now = Date.now();
const tokenResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/auth_tokens?key=${encodeURIComponent(key)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ uses: 1, expireTime: new Date(now + 11 * 60_000).toISOString(), newSessionExpireTime: new Date(now + 60_000).toISOString(), bidiGenerateContentSetup: setup }),
});
if (!tokenResponse.ok) throw new Error(`Token request failed with ${tokenResponse.status}`);
const token = (await tokenResponse.json()).name;

const events = [];
const started = Date.now();
const socket = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`);
const ready = new Promise((resolve, reject) => {
  socket.onerror = () => reject(new Error("WebSocket error"));
  socket.onmessage = async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    const at = Date.now() - started;
    if (message.setupComplete) resolve();
    const content = message.serverContent ?? {};
    if (content.interimInputTranscription?.text) events.push({ at, kind: "interim", text: content.interimInputTranscription.text });
    if (content.inputTranscription?.text) events.push({ at, kind: "final", text: content.inputTranscription.text });
    if (message.voiceActivity) events.push({ at, kind: "vad", text: message.voiceActivity.type });
    if (message.goAway) events.push({ at, kind: "goAway", text: JSON.stringify(message.goAway) });
  };
});
socket.onopen = () => socket.send(JSON.stringify({ setup: {} }));
await ready;

const marks = [];
async function stream(buffer) {
  for (let offset = 0; offset < buffer.length; offset += 3200) {
    const chunk = buffer.subarray(offset, Math.min(offset + 3200, buffer.length));
    socket.send(JSON.stringify({ realtimeInput: { audio: { data: chunk.toString("base64"), mimeType: "audio/pcm;rate=16000" } } }));
    await wait(100);
  }
}

await stream(silence(800));
for (let index = 0; index < audio.length; index += 1) {
  const begin = Date.now() - started;
  for (let part = 0; part < audio[index].length; part += 1) {
    if (part > 0) await stream(silence(pauseMs));
    await stream(audio[index][part]);
  }
  marks.push({ index, begin, end: Date.now() - started });
  await stream(silence(2600));
}
await stream(silence(1500));
socket.close();
await wait(300);

const turns = marks.map((mark, index) => {
  const until = marks[index + 1]?.begin ?? Infinity;
  const finals = events.filter((event) => event.kind === "final" && event.at > mark.begin && event.at <= until);
  const interim = events.filter((event) => event.kind === "interim" && event.at > mark.begin && event.at <= until);
  const expected = written[index] ?? script[index].join(" ");
  const text = finals.map((item) => item.text.trim()).join(" ").trim();
  return {
    expected,
    finals: finals.map((item) => item.text.trim()),
    joined: text,
    interimCount: interim.length,
    firstInterimMs: interim[0] ? interim[0].at - mark.begin : null,
    finalAfterSpeechEndMs: finals.length ? finals.at(-1).at - mark.end : null,
    wer: Number(wordErrorRate(expected, text).toFixed(3)),
  };
});

const report = { model: setup.model, vad: setup.realtimeInputConfig.automaticActivityDetection, pauseMs, noise, turns, events };
for (const turn of turns) {
  console.log(`${turn.wer.toFixed(2)} finals=${turn.finals.length} interim=${turn.interimCount} lag=${turn.finalAfterSpeechEndMs}ms | ${turn.joined}`);
}
console.log("mean WER", (turns.reduce((sum, turn) => sum + turn.wer, 0) / turns.length).toFixed(3));
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
}
