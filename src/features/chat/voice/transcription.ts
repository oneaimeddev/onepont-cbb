export const messageLimit = 2000;

const fillerPattern = /^(?:h+m+|hum+|ã+h*|é+h*|ah+|eh+|uh+|ahn+|hã+)$/;

export function pcmBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function cleanSegment(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  const bare = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  if (!bare || fillerPattern.test(bare)) return "";
  return value;
}

export function joinSegments(current: string, segment: string) {
  if (!current) return segment;
  if (!segment) return current;
  return `${current} ${segment}`;
}

// Must outlast the gap between a segment's final and resumed speech: about
// 1.3 s for a 1.8 s pause, since the service closes segments after 1 s of silence.
export function commitDelay(buffer: string) {
  return buffer.length > 120 ? 3000 : 1600;
}

export type LiveMessage =
  | { kind: "ready" }
  | { kind: "speech" }
  | { kind: "interim"; text: string }
  | { kind: "final"; text: string }
  | { kind: "goAway" }
  | { kind: "ignored" };

export function readLiveMessage(raw: string): LiveMessage {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) return { kind: "ignored" };
    throw error;
  }
  if (message.setupComplete) return { kind: "ready" };
  if (message.goAway) return { kind: "goAway" };
  if ((message.voiceActivity as { type?: unknown } | undefined)?.type === "ACTIVITY_START") return { kind: "speech" };
  const content = message.serverContent as { interimInputTranscription?: { text?: unknown }; inputTranscription?: { text?: unknown } } | undefined;
  const final = content?.inputTranscription?.text;
  if (typeof final === "string") return { kind: "final", text: final };
  const interim = content?.interimInputTranscription?.text;
  if (typeof interim === "string") return { kind: "interim", text: interim };
  return { kind: "ignored" };
}
