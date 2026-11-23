const sampleRate = 16000;
const headerSize = 44;

/** Encode a standalone mono PCM segment at the capture API's sample rate. */
export function encodeConsultationSegment(samples: Float32Array): Blob {
  if (samples.length < 16 || samples.length > sampleRate * 60) {
    throw new RangeError("Duração do segmento inválida.");
  }

  const buffer = new ArrayBuffer(headerSize + samples.length * 2);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode("RIFF"), 0);
  view.setUint32(4, buffer.byteLength - 8, true);
  bytes.set(encoder.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set(encoder.encode("data"), 36);
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(headerSize + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}
