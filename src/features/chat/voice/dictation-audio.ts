// Shared by the browser recorder and the transcription route: 16 kHz mono 16-bit PCM WAV.
export const sampleRate = 16_000;
export const frameSamples = 1_600; // 100 ms frames posted by /voice/pcm-capture.js
// Long dictations are split into segments that are transcribed while recording continues.
export const maxSegmentSeconds = 55;
export const segmentTargetFrames = 500; // 50 s
export const minimumFrames = 3; // 300 ms

/** Index after which to split, picking the quietest frame in the last 5 s so words are not cut. */
export function quietCut(frames: Int16Array[], from: number) {
  let best = frames.length;
  let quietest = Infinity;
  for (let index = Math.max(from, frames.length - 50); index < frames.length; index++) {
    const frame = frames[index];
    let energy = 0;
    for (let sample = 0; sample < frame.length; sample += 8) energy += Math.abs(frame[sample]);
    if (energy < quietest) {
      quietest = energy;
      best = index + 1;
    }
  }
  return best;
}

export function encodeWav(frames: Int16Array[]): Blob {
  const samples = frames.reduce((total, frame) => total + frame.length, 0);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) bytes[offset + index] = text.charCodeAt(index);
  };
  ascii(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const frame of frames) {
    new Int16Array(buffer, offset, frame.length).set(frame);
    offset += frame.length * 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
