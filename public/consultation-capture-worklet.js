class ConsultationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    // The context runs at the device rate (Safari distorts or silences a forced 16 kHz context);
    // samples are averaged down to 16 kHz here, as in the chat dictation.
    this.ratio = sampleRate / 16000;
    this.position = 0;
    this.sum = 0;
    this.taken = 0;
    this.samples = new Float32Array(160000);
    this.count = 0;
    this.active = true;
    this.frames = 0;
    this.peak = 0;
    this.port.onmessage = ({ data }) => {
      if (data === "resume") {
        this.active = true;
        return;
      }
      this.active = false;
      this.flush();
      this.port.postMessage(data);
    };
  }

  flush() {
    if (this.count >= 16) {
      const segment = this.samples.slice(0, this.count);
      this.port.postMessage(segment, [segment.buffer]);
    }
    this.count = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (this.active && channel) {
      for (const sample of channel) {
        this.peak = Math.max(this.peak, Math.abs(sample));
        this.sum += sample;
        this.taken += 1;
        this.position += 1;
        if (this.position < this.ratio) continue;
        this.position -= this.ratio;
        this.samples[this.count++] = Math.max(-1, Math.min(1, this.sum / this.taken));
        this.sum = 0;
        this.taken = 0;
        if (this.count === this.samples.length) this.flush();
      }
      if (++this.frames === 8) {
        this.port.postMessage(this.peak);
        this.frames = 0;
        this.peak = 0;
      }
    }
    return true;
  }
}

registerProcessor("consultation-capture", ConsultationCapture);
