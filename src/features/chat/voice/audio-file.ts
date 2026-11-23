"use client";

import { encodeWav, frameSamples, minimumFrames, quietCut, sampleRate, segmentTargetFrames } from "./dictation-audio";

// An attached recording is decoded in the browser, converted to 16 kHz mono PCM and split into
// segments of up to 50 s cut at quiet frames, the same format the dictation route accepts. The
// file itself never leaves the device; only the segments are sent for transcription.
export const maxAudioMinutes = 90;
export const maxAudioBytes = 200 * 1024 * 1024;
export const audioAccept = "audio/*,.m4a,.mp3,.wav,.ogg,.oga,.opus,.webm,.aac,.amr,.3gp";

export class AudioFileError extends Error {}

export type PreparedAudio = { segments: Blob[]; seconds: number };

export async function prepareAudioFile(file: File): Promise<PreparedAudio> {
  if (file.size > maxAudioBytes) throw new AudioFileError("O arquivo passa de 200 MB. Envie uma gravação menor ou dividida.");
  if (typeof OfflineAudioContext === "undefined") throw new AudioFileError("Este navegador não consegue abrir arquivos de áudio. Tente pelo computador.");
  let decoded: AudioBuffer;
  try {
    // decodeAudioData resamples to the context rate, so the buffer comes back at 16 kHz.
    const context = new OfflineAudioContext(1, 1, sampleRate);
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new AudioFileError("Não foi possível abrir este arquivo de áudio. Use MP3, M4A, WAV, OGG ou WebM.");
  }
  if (decoded.duration > maxAudioMinutes * 60) throw new AudioFileError(`A gravação passa de ${maxAudioMinutes} minutos. Divida o áudio e anexe as partes.`);
  if (decoded.duration < 1) throw new AudioFileError("A gravação está vazia ou é curta demais.");

  // Downmix to mono 16-bit frames of 100 ms.
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
  const frames: Int16Array[] = [];
  for (let start = 0; start < decoded.length; start += frameSamples) {
    const length = Math.min(frameSamples, decoded.length - start);
    const frame = new Int16Array(length);
    for (let index = 0; index < length; index++) {
      let sum = 0;
      for (const channel of channels) sum += channel[start + index];
      const sample = Math.max(-1, Math.min(1, sum / channels.length));
      frame[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    frames.push(frame);
  }

  const segments: Blob[] = [];
  let rest = frames;
  while (rest.length) {
    const at = rest.length > segmentTargetFrames ? quietCut(rest.slice(0, segmentTargetFrames), 0) : rest.length;
    // A final tail under 300 ms carries no speech and is below the route's minimum.
    if (at < minimumFrames) break;
    segments.push(encodeWav(rest.slice(0, at)));
    rest = rest.slice(at);
  }
  return { segments, seconds: decoded.duration };
}

export function durationLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.max(1, Math.round(seconds))} s`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
