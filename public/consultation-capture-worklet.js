class ConsultationCapture extends AudioWorkletProcessor {
  constructor() {
    super();
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
        this.samples[this.count++] = sample;
        this.peak = Math.max(this.peak, Math.abs(sample));
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
