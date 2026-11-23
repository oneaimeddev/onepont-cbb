"use client";

import { useRef, useState } from "react";
import { AudioFileError, durationLabel, prepareAudioFile } from "./audio-file";

// Transcribes an attached consultation recording: the file is prepared in the browser and its
// segments go to the transcription route a few at a time, in order. The joined transcript is
// handed back once every segment succeeded; failed segments can be retried without redoing the rest.
export type ConsultationAudioState = "idle" | "preparing" | "transcribing" | "error";

type Job = { file: string; seconds: number; segments: Blob[]; texts: (string | null)[] };

const concurrency = 3;

export function useConsultationAudio({ onTranscript }: {
  onTranscript: (result: { transcript: string; fileName: string; duration: string }) => void | Promise<void>;
}) {
  const [state, setState] = useState<ConsultationAudioState>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const job = useRef<Job | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  async function transcribeSegment(segment: Blob, signal: AbortSignal) {
    const response = await fetch("/api/inteligencia/ditado?modo=consulta", {
      method: "POST",
      headers: { "content-type": "audio/wav" },
      body: segment,
      cache: "no-store",
      signal,
    });
    const body = await response.json().catch(() => ({})) as { text?: unknown };
    if (!response.ok || typeof body.text !== "string") {
      throw new Error(typeof body.text === "string" ? body.text : "Não foi possível transcrever um trecho da gravação.");
    }
    return body.text;
  }

  async function run() {
    const current = job.current;
    if (!current) return;
    const ticket = ++generation.current;
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setState("transcribing");
    setError(null);
    setCanRetry(false);
    const pending = current.texts.flatMap((text, index) => text === null ? [index] : []);
    setProgress({ done: current.texts.length - pending.length, total: current.texts.length });
    let failure: string | null = null;
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length && !signal.aborted) {
        const index = pending[cursor++];
        try {
          current!.texts[index] = await transcribeSegment(current!.segments[index], signal).catch(() => transcribeSegment(current!.segments[index], signal));
          if (ticket === generation.current) setProgress((value) => ({ ...value, done: value.done + 1 }));
        } catch (cause) {
          if (signal.aborted) return;
          failure ??= cause instanceof Error ? cause.message : "Não foi possível transcrever um trecho da gravação.";
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (ticket !== generation.current || signal.aborted) return;
    if (failure || current.texts.some((text) => text === null)) {
      setError(`${failure ?? "Parte da gravação não foi transcrita."} Os trechos já transcritos foram mantidos.`);
      setCanRetry(true);
      setState("error");
      return;
    }
    const transcript = current.texts.map((text) => text!.trim()).filter(Boolean).join("\n");
    if (!transcript) {
      job.current = null;
      setError("Nenhuma fala foi identificada na gravação.");
      setState("error");
      return;
    }
    job.current = null;
    try {
      await onTranscript({ transcript, fileName: current.file, duration: durationLabel(current.seconds) });
      setState("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível levar a transcrição ao chat.");
      setState("error");
    }
  }

  async function attach(file: File) {
    if (state === "preparing" || state === "transcribing") return;
    const ticket = ++generation.current;
    setState("preparing");
    setError(null);
    setCanRetry(false);
    setProgress({ done: 0, total: 0 });
    try {
      const prepared = await prepareAudioFile(file);
      if (ticket !== generation.current) return;
      job.current = { file: file.name, seconds: prepared.seconds, segments: prepared.segments, texts: prepared.segments.map(() => null) };
    } catch (cause) {
      if (ticket !== generation.current) return;
      setError(cause instanceof AudioFileError ? cause.message : "Não foi possível abrir este arquivo de áudio.");
      setState("error");
      return;
    }
    await run();
  }

  function cancel() {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    job.current = null;
    setError(null);
    setCanRetry(false);
    setProgress({ done: 0, total: 0 });
    setState("idle");
  }

  return {
    state,
    busy: state === "preparing" || state === "transcribing",
    progress,
    error,
    canRetry,
    attach,
    retry: () => void run(),
    cancel,
  };
}
