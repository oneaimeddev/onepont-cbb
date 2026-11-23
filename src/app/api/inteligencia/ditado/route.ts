import { getAccess } from "../../../../lib/profile";
import { voiceApiKey } from "../../../../features/chat/config";
import { dictationInstruction } from "../../../../features/chat/voice/dictation-prompt";
import { maxSegmentSeconds, sampleRate } from "../../../../features/chat/voice/dictation-audio";

// Transcribes one recorded dictation segment and returns only the text. The audio is
// validated, sent to the provider and discarded; nothing is stored.
export const maxDuration = 30;

const headerSize = 44;
const minBytes = headerSize + sampleRate * 2 * 0.2;
const maxBytes = headerSize + sampleRate * 2 * maxSegmentSeconds;
const windowMs = 10 * 60 * 1000;
const maxSegments = 40;
const hits = new Map<string, number[]>();
const noStore = { "cache-control": "no-store" };

function withinLimit(userId: string) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < windowMs);
  const allowed = recent.length < maxSegments;
  if (allowed) recent.push(now);
  hits.set(userId, recent);
  return allowed;
}

function isPcmWav(audio: Buffer) {
  return audio.toString("ascii", 0, 4) === "RIFF"
    && audio.readUInt32LE(4) === audio.length - 8
    && audio.toString("ascii", 8, 16) === "WAVEfmt "
    && audio.readUInt32LE(16) === 16
    && audio.readUInt16LE(20) === 1
    && audio.readUInt16LE(22) === 1
    && audio.readUInt32LE(24) === sampleRate
    && audio.readUInt32LE(28) === sampleRate * 2
    && audio.readUInt16LE(32) === 2
    && audio.readUInt16LE(34) === 16
    && audio.toString("ascii", 36, 40) === "data"
    && audio.readUInt32LE(40) === audio.length - headerSize
    && audio.length % 2 === 0;
}

const errors = {
  unavailable: "A transcrição por voz está indisponível. Você pode continuar digitando.",
  limit: "Muitas gravações em pouco tempo. Aguarde alguns minutos e tente novamente.",
  provider: "Não foi possível transcrever a gravação agora. Tente novamente.",
} as const;

export async function POST(request: Request) {
  let originHost = "";
  try { originHost = new URL(request.headers.get("origin") ?? "").host; } catch { /* Origem ausente ou inválida. */ }
  if (!originHost || originHost !== request.headers.get("host")) {
    return Response.json({ error: "invalid" }, { status: 403, headers: noStore });
  }
  // Session and professional profile are checked against Supabase before any audio is read.
  const access = await getAccess();
  if (access.status !== 200) return Response.json({ error: "invalid" }, { status: access.status, headers: noStore });
  const apiKey = voiceApiKey();
  if (!apiKey) return Response.json({ error: "unavailable", text: errors.unavailable }, { status: 503, headers: noStore });
  if (request.headers.get("content-type")?.split(";")[0] !== "audio/wav") {
    return Response.json({ error: "invalid" }, { status: 415, headers: noStore });
  }
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(declared) || declared < minBytes || declared > maxBytes) {
    return Response.json({ error: "invalid" }, { status: 413, headers: noStore });
  }
  if (!withinLimit(access.userId)) return Response.json({ error: "limit", text: errors.limit }, { status: 429, headers: noStore });
  const audio = Buffer.from(await request.arrayBuffer());
  if (audio.length !== declared || !isPcmWav(audio)) return Response.json({ error: "invalid" }, { status: 400, headers: noStore });

  const model = process.env.CBB_DICTATION_MODEL || process.env.CONSULTATION_GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!/^gemini-[\w.-]+$/.test(model)) return Response.json({ error: "unavailable", text: errors.unavailable }, { status: 503, headers: noStore });
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: dictationInstruction }] },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: audio.toString("base64") } }] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!response.ok) {
      console.error(JSON.stringify({ event: "dictation_failed", status: response.status }));
      return Response.json({ error: "provider", text: errors.provider }, { status: 502, headers: noStore });
    }
    const result = await response.json() as {
      candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const candidate = result.candidates?.[0];
    if (!candidate || candidate.finishReason !== "STOP") {
      console.error(JSON.stringify({ event: "dictation_failed", reason: candidate?.finishReason ?? "empty" }));
      return Response.json({ error: "provider", text: errors.provider }, { status: 502, headers: noStore });
    }
    const text = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("")
      .replace(/\[sem fala\]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return Response.json({ text }, { headers: noStore });
  } catch (cause) {
    console.error(JSON.stringify({ event: "dictation_failed", reason: cause instanceof Error ? cause.name : "unknown" }));
    return Response.json({ error: "provider", text: errors.provider }, { status: 502, headers: noStore });
  }
}
