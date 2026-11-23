"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { encodeWav, minimumFrames, quietCut, segmentTargetFrames } from "./dictation-audio";

// Dictation works like a voice note: the microphone records locally from the click, and on
// stop the audio is transcribed and handed back as editable text. Nothing is sent on its own.
export type DictationState = "idle" | "starting" | "recording" | "transcribing" | "error";

export const maxRecordingMs = 10 * 60_000;

type Segment = { blob: Blob; text: string | null; failed: boolean; message: string | null; promise: Promise<void> | null };

type Runtime = {
  generation: number;
  phase: DictationState;
  context: AudioContext | null;
  stream: MediaStream | null;
  release: (() => void) | null;
  frames: Int16Array[];
  segments: Segment[];
  controller: AbortController | null;
  startedAt: number;
  level: number;
};

const messages = {
  denied: "O acesso ao microfone foi negado. Libere o microfone no navegador para gravar.",
  missing: "Nenhum microfone foi encontrado neste dispositivo.",
  unsupported: "Este navegador não permite gravar áudio. Você pode continuar digitando.",
  failed: "Não foi possível transcrever a gravação. Tente novamente.",
  silent: "Nenhuma fala foi identificada na gravação.",
} as const;

class DictationFailure extends Error {}

function failureText(error: unknown) {
  if (error instanceof DictationFailure) return error.message;
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return messages.denied;
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return messages.missing;
  }
  return messages.unsupported;
}

export function useDictation({ onText }: { onText: (text: string) => void }) {
  const onTextRef = useRef(onText);
  const runtime = useRef<Runtime>({
    generation: 0, phase: "idle", context: null, stream: null, release: null,
    frames: [], segments: [], controller: null, startedAt: 0, level: 0,
  });
  const [state, setState] = useState<DictationState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);

  useLayoutEffect(() => {
    onTextRef.current = onText;
  });

  function setPhase(next: DictationState) {
    runtime.current.phase = next;
    setState(next);
  }

  function releaseInput() {
    const rt = runtime.current;
    rt.release?.();
    rt.release = null;
    for (const track of rt.stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    rt.stream = null;
    if (rt.context && rt.context.state !== "closed") void rt.context.close().catch(() => undefined);
    rt.context = null;
    rt.level = 0;
    setLevel(0);
  }

  function upload(segment: Segment) {
    const rt = runtime.current;
    const signal = rt.controller?.signal;
    segment.failed = false;
    segment.message = null;
    segment.promise = fetch("/api/inteligencia/ditado", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: segment.blob,
      cache: "no-store",
      signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { text?: unknown };
      if (!response.ok) {
        segment.failed = true;
        segment.message = typeof body.text === "string" ? body.text : null;
        return;
      }
      segment.text = typeof body.text === "string" ? body.text : "";
    }, () => {
      segment.failed = true;
    });
  }

  function cut(final: boolean) {
    const rt = runtime.current;
    const at = final ? rt.frames.length : quietCut(rt.frames, 0);
    const taken = rt.frames.slice(0, at);
    rt.frames = rt.frames.slice(at);
    // A tail shorter than 300 ms carries no speech worth a request.
    if (taken.length < minimumFrames) return;
    const segment: Segment = { blob: encodeWav(taken), text: null, failed: false, message: null, promise: null };
    rt.segments.push(segment);
    upload(segment);
  }

  function onFrame(buffer: ArrayBuffer) {
    const rt = runtime.current;
    if (rt.phase !== "recording") return;
    const frame = new Int16Array(buffer);
    let peak = 0;
    for (let index = 0; index < frame.length; index += 10) {
      const value = frame[index] < 0 ? -frame[index] : frame[index];
      if (value > peak) peak = value;
    }
    rt.level = peak / 32767;
    rt.frames.push(frame);
    if (rt.frames.length >= segmentTargetFrames) cut(false);
  }

  async function finish() {
    const rt = runtime.current;
    const generation = rt.generation;
    await Promise.all(rt.segments.map((segment) => segment.promise));
    if (generation !== rt.generation) return;
    const failed = rt.segments.find((segment) => segment.failed);
    if (failed) {
      setCanRetry(true);
      setError(failed.message ?? messages.failed);
      setPhase("error");
      return;
    }
    const text = rt.segments.map((segment) => segment.text?.trim() ?? "").filter(Boolean).join(" ");
    rt.segments = [];
    rt.controller = null;
    setCanRetry(false);
    if (!text) {
      setError(messages.silent);
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("idle");
    onTextRef.current(text);
  }

  function cancel() {
    const rt = runtime.current;
    rt.generation += 1;
    rt.controller?.abort();
    rt.controller = null;
    releaseInput();
    rt.frames = [];
    rt.segments = [];
    setElapsed(0);
    setError(null);
    setCanRetry(false);
    setPhase("idle");
  }

  async function stop() {
    const rt = runtime.current;
    if (rt.phase === "starting") {
      cancel();
      return;
    }
    if (rt.phase !== "recording") return;
    releaseInput();
    cut(true);
    setPhase("transcribing");
    if (!rt.segments.length) {
      rt.controller = null;
      setError(messages.silent);
      setPhase("error");
      return;
    }
    await finish();
  }

  async function retry() {
    const rt = runtime.current;
    if (rt.phase !== "error" || !rt.segments.length) return;
    rt.controller = new AbortController();
    for (const segment of rt.segments) if (segment.failed) upload(segment);
    setError(null);
    setPhase("transcribing");
    await finish();
  }

  async function start() {
    const rt = runtime.current;
    if (rt.phase !== "idle" && rt.phase !== "error") return;
    cancel();
    const generation = rt.generation;
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined" || typeof AudioContext === "undefined") {
        throw new DictationFailure(messages.unsupported);
      }
      // Audio context, capture module and microphone are prepared together on the click.
      const context = new AudioContext();
      rt.context = context;
      const resumed = context.resume();
      void resumed.catch(() => undefined);
      const moduleReady = context.audioWorklet.addModule("/voice/pcm-capture.js");
      void moduleReady.catch(() => undefined);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== rt.generation) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      rt.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new DictationFailure(messages.missing);
      track.onended = () => {
        if (generation === runtime.current.generation) void stop();
      };
      await resumed;
      await moduleReady;
      if (generation !== rt.generation) return;
      if (context.state === "suspended") throw new DictationFailure(messages.unsupported);
      const source = context.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(context, "pcm-capture", { channelCount: 1 });
      const sink = context.createGain();
      sink.gain.value = 0.00001;
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (generation === runtime.current.generation) onFrame(event.data);
      };
      source.connect(capture).connect(sink).connect(context.destination);
      rt.release = () => {
        capture.port.onmessage = null;
        capture.port.close();
        source.disconnect();
        capture.disconnect();
        sink.disconnect();
      };
      rt.controller = new AbortController();
      rt.startedAt = Date.now();
      setElapsed(0);
      setPhase("recording");
    } catch (cause) {
      if (generation !== runtime.current.generation) return;
      releaseInput();
      setCanRetry(false);
      setError(failureText(cause));
      setPhase("error");
    }
  }

  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => {
      const rt = runtime.current;
      const now = Date.now() - rt.startedAt;
      setElapsed(now);
      setLevel(rt.level);
      if (now >= maxRecordingMs) void stop();
    }, 200);
    return () => clearInterval(timer);
  });

  useEffect(() => {
    if (state === "idle") return;
    function onLeave() {
      cancel();
    }
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  });

  useEffect(() => {
    const rt = runtime.current;
    return () => {
      rt.generation += 1;
      rt.controller?.abort();
      rt.release?.();
      for (const track of rt.stream?.getTracks() ?? []) track.stop();
      if (rt.context && rt.context.state !== "closed") void rt.context.close().catch(() => undefined);
    };
  }, []);

  return {
    state,
    active: state === "starting" || state === "recording" || state === "transcribing",
    elapsed,
    level,
    error,
    canRetry,
    start,
    stop,
    cancel,
    retry,
  };
}
