"use client";

import styles from "./consultation-capture.module.css";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { encodeConsultationSegment } from "./consultation-audio";
import { pendingSegments, queueSegment, removeSegment } from "./consultation-queue";

type Capture = { id: string; state: "recording" | "partial" | "complete"; received: number; lastSegment: number | null };
type Recorder = { stream: MediaStream; context: AudioContext; node: AudioWorkletNode };

export function ConsultationProcessing({ athlete, session, regenerate = false }: { athlete: string; session: string; regenerate?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [retryAudio, setRetryAudio] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function run() {
    const active = new AbortController();
    controller.current = active;
    setRunning(true);
    setError("");
    setStatus("Preparando áudio…");
    const step = async (action: "next" | "regenerate" | "retry_audio") => {
      const response = await fetch("/api/inteligencia/consultas/processamento", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: active.signal,
        body: JSON.stringify({ athlete, session, action }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error ?? "processing_failed");
      return result;
    };
    try {
      if (regenerate) await step("regenerate");
      if (retryAudio) {
        await step("retry_audio");
        setRetryAudio(false);
      }
      while (!active.signal.aborted) {
        const result = await step("next");
        if (result.state === "ready") {
          router.push(`/atletas/${athlete}/evolucao?modo=voz&consulta=${session}`);
          router.refresh();
          return;
        }
        if (result.state === "busy") {
          setStatus("Aguardando o processamento do lote atual…");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          setStatus(result.remaining ? `Transcrevendo. Restam ${result.remaining} segmentos.` : "Organizando a evolução…");
        }
      }
    } catch (cause) {
      if (active.signal.aborted) return;
      if (cause instanceof Error && cause.message === "no_speech") {
        setRetryAudio(true);
        setError("A transcrição não identificou fala no áudio salvo. Você pode tentar transcrever novamente. Se persistir, verifique o microfone e inicie uma nova gravação.");
      } else {
        setError("O processamento foi interrompido. Você pode tentar novamente a partir dos lotes já salvos.");
      }
    } finally {
      if (!active.signal.aborted) {
        setStatus("");
        setRunning(false);
      }
    }
  }

  return <>
    <button type="button" className={regenerate ? "button" : styles.primary} disabled={running} onClick={() => void run()}>
      {regenerate ? "Regenerar evolução" : retryAudio ? "Transcrever novamente" : "Gerar evolução"}
    </button>
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
  </>;
}

export function ConsultationCapture({ athlete, owner, label }: { athlete: string; owner: string; label: string }) {
  const headingId = useId();
  const discardDialog = useRef<HTMLDialogElement>(null);
  const key = "cbb-consultation:" + owner + ":" + athlete;
  const [capture, setCapture] = useState<Capture | null>(null);
  const [mode, setMode] = useState<"idle" | "active" | "paused" | "interrupted" | "sending" | "ended">("idle");
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [queued, setQueued] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState("");
  const recorder = useRef<Recorder | null>(null);
  const sequence = useRef(0);
  const writes = useRef(Promise.resolve());
  const recordedMs = useRef(0);
  const failedWrite = useRef(false);
  const uploading = useRef<Promise<void> | null>(null);
  const flushed = useRef<(() => void) | null>(null);

  async function command(id: string, operation: string, extra = {}): Promise<Capture> {
    const response = await fetch("/api/inteligencia/consultas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: athlete, session_id: id, operation, ...extra }),
    });
    if (!response.ok) throw new Error("Não foi possível atualizar a sessão. Confira a conexão e tente novamente.");
    return response.json();
  }

  function upload(session: string) {
    if (uploading.current) return uploading.current;
    const task = (async () => {
      const segments = (await pendingSegments(session)).sort((a, b) => a.sequence - b.sequence);
      for (const segment of segments) {
        const query = new URLSearchParams({ target: athlete, session_id: session, sequence: String(segment.sequence) });
        const response = await fetch("/api/inteligencia/consultas?" + query, {
          method: "POST", headers: { "Content-Type": "audio/wav" }, body: segment.audio,
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) throw new Error("Envio pendente. Confira a conexão e tente novamente.");
        setCapture(await response.json());
        await removeSegment(segment.key);
        setQueued((count) => Math.max(0, count - 1));
      }
    })().finally(() => { uploading.current = null; });
    uploading.current = task;
    return task;
  }

  useEffect(() => {
    const id = localStorage.getItem(key);
    if (!id) return;
    let cancelled = false;
    async function restore(session: string) {
      try {
        const response = await fetch("/api/inteligencia/consultas", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: athlete, session_id: session, operation: "status" }),
        });
        if (!response.ok) throw new Error();
        const saved: Capture = await response.json();
        const pending = await pendingSegments(session);
        if (cancelled) return;
        sequence.current = Math.max(saved.lastSegment ?? -1, ...pending.map((item) => item.sequence)) + 1;
        setCapture(saved);
        setQueued(pending.length);
        setMode(saved.state === "recording" ? "interrupted" : "ended");
      } catch {
        if (!cancelled) setError("Não foi possível recuperar a sessão. Confira a conexão e recarregue.");
      }
    }
    void restore(id);
    return () => { cancelled = true; };
  }, [athlete, key]);

  useEffect(() => {
    if (mode !== "active") return;
    const started = performance.now();
    const tick = () => setSeconds(Math.floor((recordedMs.current + performance.now() - started) / 1000));
    const timer = window.setInterval(tick, 500);
    const warn = () => {
      if (!document.hidden) return;
      failedWrite.current = true;
      setError("A aba saiu de primeiro plano. A continuidade da captura não pôde ser confirmada.");
    };
    const preventLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    document.addEventListener("visibilitychange", warn);
    window.addEventListener("beforeunload", preventLeave);
    return () => {
      recordedMs.current += performance.now() - started;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", warn);
      window.removeEventListener("beforeunload", preventLeave);
    };
  }, [mode]);

  useEffect(() => () => {
    const current = recorder.current;
    current?.stream.getTracks().forEach((track) => track.stop());
    void current?.context.close();
  }, []);

  async function start() {
    setBusy(true);
    setError("");
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microfone indisponível neste navegador.");
      context = new AudioContext({ sampleRate: 16000 });
      if (context.sampleRate !== 16000 || !context.audioWorklet)
        throw new Error("Este navegador não oferece a captura de áudio necessária.");
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
      await context.audioWorklet.addModule("/consultation-capture-worklet.js");
      const session = await command(crypto.randomUUID(), "start", { authorization_code: "staged_fictional_v1" });
      localStorage.setItem(key, session.id);
      setCapture(session);
      if (session.received > 0 || session.state !== "recording") {
        sequence.current = (session.lastSegment ?? -1) + 1;
        setMode(session.state === "recording" ? "interrupted" : "ended");
        return;
      }
      const node = new AudioWorkletNode(context, "consultation-capture", { channelCount: 1 });
      node.port.onmessage = ({ data }) => {
        if (typeof data === "number") {
          setLevels((history) => [...history.slice(-62), data]);
          return;
        }
        if (!(data instanceof Float32Array)) {
          flushed.current?.();
          return;
        }
        const index = sequence.current++;
        writes.current = writes.current.then(async () => {
          await queueSegment(session.id, index, encodeConsultationSegment(data));
          setQueued((count) => count + 1);
          void upload(session.id).catch(() => setError("Áudio pendente de envio. Confira a conexão."));
        }).catch(() => {
          failedWrite.current = true;
          setError("Falha no armazenamento local. A gravação será marcada como parcial.");
        });
      };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener("ended", () => {
          failedWrite.current = true;
          setMode("interrupted");
          setError("O microfone foi interrompido. Encerre para salvar o material disponível.");
        });
        track.addEventListener("mute", () => {
          failedWrite.current = true;
          setError("O microfone ficou indisponível por um intervalo.");
        });
      }
      context.createMediaStreamSource(stream).connect(node).connect(context.destination);
      recorder.current = { stream, context, node };
      setMode("active");
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "A permissão de uso do microfone foi negada."
        : cause instanceof Error ? cause.message : "Não foi possível iniciar a gravação.");
    } finally {
      if (!recorder.current) {
        stream?.getTracks().forEach((track) => track.stop());
        void context?.close();
      }
      setBusy(false);
    }
  }

  async function stopCapture() {
    const current = recorder.current;
    if (!current) return;
    // Wait for the worklet to deliver its final buffered samples.
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        failedWrite.current = true;
        resolve();
      }, 1500);
      flushed.current = () => { window.clearTimeout(timeout); resolve(); };
      current.node.port.postMessage("stop");
    });
    flushed.current = null;
    current.stream.getTracks().forEach((track) => track.stop());
    await current.context.close();
    recorder.current = null;
  }

  async function finish() {
    if (!capture) return;
    setBusy(true);
    setError("");
    try {
      const interrupted = mode === "interrupted" || failedWrite.current;
      await stopCapture();
      setMode(interrupted ? "interrupted" : "sending");
      await writes.current;
      await upload(capture.id);
      await upload(capture.id);
      const saved = await command(capture.id, "finish", {
        segment_count: sequence.current,
        interrupted: interrupted || failedWrite.current || sequence.current === 0,
      });
      setCapture(saved);
      setMode("ended");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encerrar.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!capture || busy) return;
    setDiscarding(true);
    setBusy(true);
    setError("");
    try {
      await stopCapture();
      setMode("sending");
      await writes.current;
      await uploading.current?.catch(() => {});
      const result = await fetch("/api/inteligencia/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: athlete, session_id: capture.id, operation: "discard" }),
      });
      const data = await result.json();
      if (data.error === "linked_evolution") {
        setMode("ended");
        throw new Error("Esta gravação já está vinculada a uma evolução salva.");
      }
      if (!result.ok || data.state !== "discarded") throw new Error("Não foi possível concluir o descarte. Tente novamente.");
      for (const segment of await pendingSegments(capture.id)) await removeSegment(segment.key);
      localStorage.removeItem(key);
      sequence.current = 0;
      recordedMs.current = 0;
      failedWrite.current = false;
      setSeconds(0);
      setLevels([]);
      setQueued(0);
      setCapture(null);
      setMode("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível descartar a gravação.");
    } finally {
      setBusy(false);
      setDiscarding(false);
    }
  }

  const stateLabel = {
    idle: "Pronta para iniciar",
    active: "Gravando",
    paused: "Pausada",
    interrupted: "Interrompida",
    sending: "Envio pendente",
    ended: capture?.state === "partial" ? "Gravação parcial" : "Gravação encerrada",
  }[mode];

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div>
          <h2 id={headingId}>{mode === "active" || mode === "paused" ? "Consulta em andamento" : "Registrar consulta por voz"}</h2>
          <p>{label}</p>
        </div>
        <span className={styles.badge} data-active={mode === "active"} role="status">{stateLabel}</span>
      </header>
      {mode === "idle" ? <>
        <div className={styles.monitor}>
          <p>Inicie a gravação e conduza a consulta normalmente. Ao concluir, o áudio é transcrito e o relatório da consulta fica pronto para sua revisão.</p>
        </div>
        <button type="button" className={styles.primary} disabled={busy} onClick={() => void start()}>Iniciar gravação</button>
      </> : <>
        <div className={styles.monitor}>
          {(mode === "active" || mode === "paused") && <div className={styles.timer} aria-label="Tempo total em gravação">
            <span className={styles.audioIcon} aria-hidden="true"><i /><i /><i /><i /><i /></span> {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </div>}
          <p>{mode === "active" ? "Áudio sendo capturado · " : ""}{capture?.received === 1 ? "1 segmento confirmado" : `${capture?.received ?? 0} segmentos confirmados`}{queued > 0 ? ` · ${queued} pendentes de envio` : ""}</p>
          {(mode === "active" || mode === "paused") && <div className={styles.wave} aria-hidden="true">
            {Array.from({ length: 63 }, (_, index) => {
              const level = levels[index - (63 - levels.length)] ?? 0;
              return <i key={index} style={{ height: 3 + Math.min(level * 44, 20) }} />;
            })}
          </div>}
        </div>
        <div className={styles.actions}>
          {(mode === "active" || mode === "paused") && <button type="button" className={styles.secondary} disabled={busy} onClick={() => {
            recorder.current?.node.port.postMessage(mode === "active" ? "pause" : "resume");
            setMode(mode === "active" ? "paused" : "active");
          }}><span className={mode === "active" ? styles.pauseIcon : styles.playIcon} aria-hidden="true" />{mode === "active" ? "Pausar" : "Retomar"}</button>}
          {mode !== "ended" && <button type="button" className={styles.primary} disabled={busy} onClick={() => void finish()}>
            <span className={styles.stopIcon} aria-hidden="true" />{busy ? (discarding ? "Descartando…" : "Enviando…") : "Encerrar consulta"}
          </button>}
          {mode === "ended" && capture?.state === "complete" && <ConsultationProcessing athlete={athlete} session={capture.id} />}
          <button type="button" className={styles.discard} disabled={busy} onClick={() => discardDialog.current?.showModal()}>
            {discarding ? "Descartando…" : "Descartar gravação"}
          </button>
        </div>
      </>}
      {error && <p className={styles.notice} role="alert">{error}</p>}
      <dialog
        ref={discardDialog}
        className={`registration-dialog ${styles.confirmDialog}`}
        aria-labelledby={`${headingId}-discard`}
        aria-describedby={`${headingId}-discard-description`}
      >
        <header className="registration-head">
          <h2 id={`${headingId}-discard`}>Descartar gravação?</h2>
        </header>
        <p id={`${headingId}-discard-description`}>O áudio e o rascunho desta sessão serão removidos.</p>
        <div className={styles.confirmActions}>
          <button type="button" className="button outline" onClick={() => discardDialog.current?.close()}>Cancelar</button>
          <button type="button" className={`button ${styles.confirmDiscard}`} onClick={() => {
            discardDialog.current?.close();
            void discard();
          }}>Descartar gravação</button>
        </div>
      </dialog>
    </section>
  );
}
