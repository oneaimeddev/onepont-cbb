"use client";

import { useEffect, useRef, useState } from "react";
import { encodeWav, quietCut, segmentTargetFrames, minimumFrames } from "./dictation-audio";
import { transcribeConsultationSegment } from "./use-consultation-audio";

// A consultation recorded live in the chat. The microphone is captured at the device rate and
// converted to 16 kHz by the same worklet as the dictation; every 50 s a segment is cut at a quiet
// frame and transcribed while the consultation goes on. When the professional ends the recording,
// the remaining audio is transcribed and the joined transcript follows the same path as an attached
// consultation audio: the report card with the detailed or synthetic mode. Audio stays in memory
// only; nothing is stored on the device or the server.
export type ConsultationRecordingState = "idle" | "confirm" | "starting" | "recording" | "paused" | "finishing" | "error";

export const maxRecordingMinutes = 90;

type Segment = { blob: Blob; text: string | null; pending: Promise<void> | null };

function clockLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return `${Math.max(1, Math.round(seconds))} s`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function useConsultationRecording({ onTranscript }: {
  onTranscript: (result: { transcript: string; duration: string }) => void | Promise<void>;
}) {
  const [state, setState] = useState<ConsultationRecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Read by the timer and async steps, which outlive the render that created them.
  const stateRef = useRef<ConsultationRecordingState>("idle");
  useEffect(() => { stateRef.current = state; }, [state]);

  const runtime = useRef<{
    context: AudioContext | null;
    stream: MediaStream | null;
    release: (() => void) | null;
    wake: { release: () => Promise<void> } | null;
    frames: Int16Array[];
    segments: Segment[];
    capturing: boolean;
    recordedMs: number;
    resumedAt: number;
    controller: AbortController;
    timer: number | null;
  } | null>(null);

  function seconds() {
    const rt = runtime.current;
    if (!rt) return 0;
    return (rt.recordedMs + (rt.capturing ? performance.now() - rt.resumedAt : 0)) / 1000;
  }

  function transcribe(segment: Segment) {
    const rt = runtime.current;
    if (!rt) return;
    const signal = rt.controller.signal;
    segment.pending = transcribeConsultationSegment(segment.blob, signal)
      .catch(() => transcribeConsultationSegment(segment.blob, signal))
      .then((text) => { segment.text = text; })
      .catch(() => { /* Retried when the recording ends. */ })
      .finally(() => {
        segment.pending = null;
        if (runtime.current === rt) setProgress({ done: rt.segments.filter((item) => item.text !== null).length, total: rt.segments.length });
      });
  }

  function cut(final: boolean) {
    const rt = runtime.current;
    if (!rt) return;
    while (rt.frames.length >= segmentTargetFrames || (final && rt.frames.length >= minimumFrames)) {
      const at = rt.frames.length > segmentTargetFrames ? quietCut(rt.frames.slice(0, segmentTargetFrames), 0) : rt.frames.length;
      const segment: Segment = { blob: encodeWav(rt.frames.slice(0, at)), text: null, pending: null };
      rt.frames = rt.frames.slice(at);
      rt.segments.push(segment);
      transcribe(segment);
    }
    if (final) rt.frames = [];
  }

  async function keepAwake() {
    const rt = runtime.current;
    const lock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!rt || !lock) return;
    try {
      rt.wake = await lock.request("screen");
    } catch { /* The guidance asks to keep the screen on. */ }
  }

  function releaseInput() {
    const rt = runtime.current;
    if (!rt) return;
    if (rt.timer !== null) window.clearInterval(rt.timer);
    rt.timer = null;
    rt.release?.();
    rt.release = null;
    for (const track of rt.stream?.getTracks() ?? []) track.stop();
    rt.stream = null;
    void rt.context?.close().catch(() => undefined);
    rt.context = null;
    void rt.wake?.release().catch(() => undefined);
    rt.wake = null;
  }

  function pauseCapture(reason: string | null) {
    const rt = runtime.current;
    if (!rt || !rt.capturing) return;
    rt.recordedMs += performance.now() - rt.resumedAt;
    rt.capturing = false;
    setLevels([]);
    setElapsed(Math.floor(rt.recordedMs / 1000));
    setState("paused");
    if (reason) setWarning(reason);
  }

  useEffect(() => {
    // Leaving the page while recording stops the microphone on phones; the professional is told
    // and resumes when back.
    const onVisibility = () => {
      const rt = runtime.current;
      if (!rt || !rt.context) return;
      if (document.hidden && rt.capturing) {
        setWarning("A tela saiu do primeiro plano durante a gravação. Confira se o trecho foi captado e continue quando voltar.");
      } else if (!document.hidden && rt.capturing) {
        void keepAwake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    // Closing or reloading the tab would lose the recording held in memory.
    if (state !== "recording" && state !== "paused" && state !== "finishing") return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state]);

  useEffect(() => () => {
    runtime.current?.controller.abort();
    releaseInput();
    runtime.current = null;
  }, []);

  function open() {
    if (stateRef.current !== "idle") return;
    setError(null);
    setWarning(null);
    setState("confirm");
  }

  async function start() {
    if (stateRef.current !== "confirm" && stateRef.current !== "error") return;
    setState("starting");
    setError(null);
    setWarning(null);
    setCanRetry(false);
    setElapsed(0);
    setLevels([]);
    setProgress({ done: 0, total: 0 });
    stateRef.current = "starting";
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined" || typeof AudioContext === "undefined") {
        throw new Error("Este navegador não permite gravar a consulta. Use o Safari ou o Chrome atualizados.");
      }
      const context = new AudioContext();
      const resumed = context.resume();
      const moduleReady = context.audioWorklet.addModule("/voice/pcm-capture.js");
      runtime.current = {
        context, stream: null, release: null, wake: null, frames: [], segments: [], capturing: false,
        recordedMs: 0, resumedAt: 0, controller: new AbortController(), timer: null,
      };
      const rt = runtime.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      rt.stream = stream;
      await resumed;
      await moduleReady;
      const source = context.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(context, "pcm-capture", { channelCount: 1 });
      const sink = context.createGain();
      sink.gain.value = 0.00001;
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (runtime.current !== rt || !rt.capturing) return;
        const frame = new Int16Array(event.data);
        let peak = 0;
        for (let index = 0; index < frame.length; index += 4) peak = Math.max(peak, Math.abs(frame[index]));
        setLevels((history) => [...history.slice(-39), peak / 32768]);
        rt.frames.push(frame);
        if (rt.frames.length >= segmentTargetFrames) cut(false);
      };
      source.connect(capture).connect(sink).connect(context.destination);
      rt.release = () => {
        capture.port.onmessage = null;
        capture.port.close();
        source.disconnect();
        capture.disconnect();
        sink.disconnect();
      };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          if (runtime.current === rt) pauseCapture("O microfone foi interrompido. Encerre para transcrever o que já foi gravado.");
        });
      }
      rt.capturing = true;
      rt.resumedAt = performance.now();
      rt.timer = window.setInterval(() => {
        const total = seconds();
        setElapsed(Math.floor(total));
        if (total >= maxRecordingMinutes * 60) void finish();
      }, 500);
      void keepAwake();
      setState("recording");
    } catch (cause) {
      releaseInput();
      runtime.current = null;
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "O navegador não liberou o microfone. Permita o acesso ao microfone e tente de novo."
        : cause instanceof Error ? cause.message : "Não foi possível iniciar a gravação.");
      setState("error");
    }
  }

  function pause() {
    pauseCapture(null);
  }

  function resume() {
    const rt = runtime.current;
    if (!rt || rt.capturing || !rt.context || !rt.stream?.getAudioTracks().some((track) => track.readyState === "live")) return;
    void rt.context.resume();
    rt.capturing = true;
    rt.resumedAt = performance.now();
    setWarning(null);
    void keepAwake();
    setState("recording");
  }

  async function finish() {
    const rt = runtime.current;
    if (!rt || !["recording", "paused", "error"].includes(stateRef.current)) return;
    stateRef.current = "finishing";
    if (rt.capturing) {
      rt.recordedMs += performance.now() - rt.resumedAt;
      rt.capturing = false;
    }
    const total = rt.recordedMs / 1000;
    setElapsed(Math.floor(total));
    releaseInput();
    cut(true);
    setState("finishing");
    setError(null);
    setCanRetry(false);
    setProgress({ done: rt.segments.filter((item) => item.text !== null).length, total: rt.segments.length });
    if (!rt.segments.length) {
      runtime.current = null;
      setError("A gravação ficou curta demais para transcrever.");
      setState("error");
      return;
    }
    await Promise.all(rt.segments.map((segment) => segment.pending));
    for (const segment of rt.segments) if (segment.text === null) transcribe(segment);
    await Promise.all(rt.segments.map((segment) => segment.pending));
    if (runtime.current !== rt) return;
    if (rt.segments.some((segment) => segment.text === null)) {
      setError("Parte da gravação não foi transcrita. Confira a conexão e tente novamente; os trechos já transcritos foram mantidos.");
      setCanRetry(true);
      setState("error");
      return;
    }
    const transcript = rt.segments.map((segment) => segment.text!.trim()).filter(Boolean).join("\n");
    if (!transcript.replace(/\[sem fala\]/gi, "").trim()) {
      runtime.current = null;
      setError("Nenhuma fala foi identificada na gravação. Confira o microfone e grave novamente.");
      setState("error");
      return;
    }
    try {
      await onTranscript({ transcript, duration: clockLabel(total) });
      runtime.current = null;
      setState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível levar a transcrição ao chat.");
      setCanRetry(true);
      setState("error");
    }
  }

  function cancel() {
    runtime.current?.controller.abort();
    releaseInput();
    runtime.current = null;
    setError(null);
    setWarning(null);
    setCanRetry(false);
    setElapsed(0);
    setLevels([]);
    setState("idle");
  }

  return {
    state,
    active: state !== "idle" && state !== "confirm",
    elapsed,
    levels,
    warning,
    error,
    canRetry,
    progress,
    open,
    start: () => void start(),
    pause,
    resume,
    finish: () => void finish(),
    cancel,
  };
}
