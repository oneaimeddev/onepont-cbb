// Downsamples microphone audio to 16 kHz mono 16-bit PCM and posts 100 ms frames.
// Audio only leaves this worklet as transferable buffers; nothing is stored.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.frame = new Int16Array(1600);
    this.length = 0;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let index = 0; index < channel.length; index += 1) {
      this.sum += channel[index];
      this.count += 1;
      this.position += 1;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;
      const sample = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.frame[this.length] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      this.length += 1;
      if (this.length === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Int16Array(1600);
        this.length = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
