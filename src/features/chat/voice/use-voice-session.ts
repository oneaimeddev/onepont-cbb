"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cleanSegment, commitDelay, joinSegments, messageLimit, pcmBase64, readLiveMessage, type LiveMessage } from "./transcription";

export type VoiceStatus = "inactive" | "connecting" | "listening" | "transcribing" | "processing" | "muted" | "error";

type Phase = "inactive" | "connecting" | "live" | "error";

type Options = {
  busy: boolean;
  onTurn: (text: string) => void;
  onDraft: (text: string) => void;
};

type Runtime = {
  generation: number;
  stream: MediaStream | null;
  context: AudioContext | null;
  socket: WebSocket | null;
  ready: boolean;
  muted: boolean;
  buffer: string;
  queue: string[];
  last: { text: string; at: number } | null;
  lastActivity: number;
  renewals: number;
  timers: Set<ReturnType<typeof setTimeout>>;
  commitTimer: ReturnType<typeof setTimeout> | null;
  renewTimer: ReturnType<typeof setTimeout> | null;
  permission: PermissionStatus | null;
  frames: number;
  level: number;
  maxLevel: number;
};

export const idleWarningMs = 105_000;
export const idleStopMs = 120_000;
const setupTimeoutMs = 10_000;
const renewAfterMs = 9.5 * 60_000;
const maxRenewals = 6;
const duplicateWindowMs = 4_000;

const messages = {
  denied: "O acesso ao microfone foi negado. Libere o microfone no navegador para usar a voz.",
  missing: "Nenhum microfone foi encontrado neste dispositivo.",
  unsupported: "Este navegador não permite conversa por voz. Você pode continuar digitando.",
  lost: "O acesso ao microfone foi interrompido. A conversa por voz foi encerrada.",
  dropped: "A conexão de voz caiu. O texto pendente foi colocado no campo de mensagem.",
  connect: "Não foi possível conectar a voz agora. Tente novamente.",
  idle: "A conversa por voz foi encerrada após 2 minutos sem atividade.",
  maximum: "A sessão de voz atingiu o tempo máximo. Inicie novamente para continuar.",
} as const;

class VoiceFailure extends Error {}

function failureText(error: unknown) {
  if (error instanceof VoiceFailure) return error.message;
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return messages.denied;
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") return messages.missing;
  }
  if (error instanceof TypeError) return messages.connect;
  throw error;
}

export function useVoiceSession(options: Options) {
  const optionsRef = useRef(options);
  const reviewRef = useRef(false);
  const runtime = useRef<Runtime>({
    generation: 0,
    stream: null,
    context: null,
    socket: null,
    ready: false,
    muted: false,
    buffer: "",
    queue: [],
    last: null,
    lastActivity: 0,
    renewals: 0,
    timers: new Set(),
    commitTimer: null,
    renewTimer: null,
    permission: null,
    frames: 0,
    level: 0,
    maxLevel: 0,
  });
  const [phase, setPhase] = useState<Phase>("inactive");
  const [muted, setMuted] = useState(false);
  const [partial, setPartial] = useState("");
  const [held, setHeld] = useState("");
  const [idleWarning, setIdleWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReviewState] = useState(false);
  const [level, setLevel] = useState(0);
  const [capture, setCapture] = useState<"pending" | "hearing" | "silent" | "blocked">("pending");
  const [deviceLabel, setDeviceLabel] = useState("");

  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  function later(callback: () => void, ms: number) {
    const timer = setTimeout(() => {
      runtime.current.timers.delete(timer);
      callback();
    }, ms);
    runtime.current.timers.add(timer);
    return timer;
  }

  function touch() {
    runtime.current.lastActivity = Date.now();
    setIdleWarning(false);
  }

  function flush() {
    const rt = runtime.current;
    if (optionsRef.current.busy || rt.queue.length === 0) return;
    const text = rt.queue.join(" ");
    rt.queue = [];
    if (text.length > messageLimit) optionsRef.current.onDraft(text);
    else optionsRef.current.onTurn(text);
  }

  function commit() {
    const rt = runtime.current;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = null;
    const text = rt.buffer.trim();
    rt.buffer = "";
    setHeld("");
    if (!text) return;
    const now = Date.now();
    if (rt.last && rt.last.text === text && now - rt.last.at < duplicateWindowMs) return;
    rt.last = { text, at: now };
    if (reviewRef.current || text.length > messageLimit) {
      optionsRef.current.onDraft(text);
      return;
    }
    rt.queue.push(text);
    flush();
  }

  function scheduleCommit(ms: number) {
    const rt = runtime.current;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = setTimeout(commit, ms);
  }

  function takePending() {
    const rt = runtime.current;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = null;
    const text = [rt.buffer.trim(), ...rt.queue].filter(Boolean).join(" ");
    rt.buffer = "";
    rt.queue = [];
    setHeld("");
    return text;
  }

  function teardown() {
    const rt = runtime.current;
    rt.generation += 1;
    for (const timer of rt.timers) clearTimeout(timer);
    rt.timers.clear();
    rt.renewTimer = null;
    const socket = rt.socket;
    rt.socket = null;
    rt.ready = false;
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000);
    }
    if (rt.permission) rt.permission.onchange = null;
    rt.permission = null;
    for (const track of rt.stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    rt.stream = null;
    if (rt.context && rt.context.state !== "closed") void rt.context.close();
    rt.context = null;
    rt.muted = false;
    rt.renewals = 0;
    rt.frames = 0;
    rt.level = 0;
    rt.maxLevel = 0;
    setMuted(false);
    setPartial("");
    setIdleWarning(false);
    setLevel(0);
    setCapture("pending");
    setDeviceLabel("");
  }

  function end(next: { notice?: string; error?: string; discard?: boolean } = {}) {
    const pending = takePending();
    teardown();
    if (pending && !next.discard) optionsRef.current.onDraft(pending);
    setPhase(next.error ? "error" : "inactive");
    setError(next.error ?? null);
    setNotice(next.notice ?? null);
  }

  function sendAudio(buffer: ArrayBuffer) {
    const rt = runtime.current;
    const socket = rt.socket;
    const samples = new Int16Array(buffer);
    let peak = 0;
    for (let index = 0; index < samples.length; index += 10) {
      const value = samples[index] < 0 ? -samples[index] : samples[index];
      if (value > peak) peak = value;
    }
    rt.frames += 1;
    rt.level = peak / 32767;
    if (rt.level > rt.maxLevel) rt.maxLevel = rt.level;
    if (!rt.ready || rt.muted || !socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ realtimeInput: { audio: { data: pcmBase64(buffer), mimeType: "audio/pcm;rate=16000" } } }));
  }

  function handle(message: LiveMessage, current: boolean) {
    const rt = runtime.current;
    if (!current && message.kind !== "final") return;
    if (message.kind === "ready") {
      rt.ready = true;
      setPhase("live");
      touch();
      if (rt.renewTimer) clearTimeout(rt.renewTimer);
      rt.renewTimer = later(renew, renewAfterMs);
      return;
    }
    if (message.kind === "goAway") {
      renew();
      return;
    }
    if (message.kind === "speech") {
      touch();
      if (rt.buffer) scheduleCommit(commitDelay(rt.buffer) + 2500);
      return;
    }
    if (message.kind === "interim") {
      touch();
      setPartial(message.text.trim());
      if (rt.buffer) scheduleCommit(commitDelay(rt.buffer) + 2500);
      return;
    }
    if (message.kind === "final") {
      touch();
      setPartial("");
      const segment = cleanSegment(message.text);
      if (segment) {
        rt.buffer = joinSegments(rt.buffer, segment);
        setHeld(rt.buffer);
      }
      if (rt.buffer) scheduleCommit(commitDelay(rt.buffer));
    }
  }

  async function connect(generation: number) {
    const response = await fetch("/api/inteligencia/voz", { method: "POST", cache: "no-store" });
    let body: { token?: unknown; url?: unknown; text?: unknown } = {};
    try {
      body = await response.json() as typeof body;
    } catch (cause) {
      if (!(cause instanceof SyntaxError)) throw cause;
    }
    if (generation !== runtime.current.generation) return;
    if (!response.ok || typeof body.token !== "string" || typeof body.url !== "string") {
      throw new VoiceFailure(typeof body.text === "string" ? body.text : messages.connect);
    }
    const socket = new WebSocket(`${body.url}?access_token=${encodeURIComponent(body.token)}`);
    runtime.current.socket = socket;
    runtime.current.ready = false;
    const setupTimer = later(() => {
      if (socket === runtime.current.socket && !runtime.current.ready) end({ error: messages.connect });
    }, setupTimeoutMs);
    socket.onopen = () => socket.send(JSON.stringify({ setup: {} }));
    socket.onmessage = async (event: MessageEvent<string | Blob>) => {
      const raw = typeof event.data === "string" ? event.data : await event.data.text();
      const message = readLiveMessage(raw);
      if (message.kind === "ready") clearTimeout(setupTimer);
      handle(message, socket === runtime.current.socket);
    };
    socket.onclose = () => {
      if (socket !== runtime.current.socket) return;
      end({ error: messages.dropped });
    };
  }

  function renew() {
    const rt = runtime.current;
    const previous = rt.socket;
    if (!previous) return;
    if (rt.renewals >= maxRenewals) {
      end({ notice: messages.maximum });
      return;
    }
    rt.renewals += 1;
    rt.socket = null;
    rt.ready = false;
    if (previous.readyState === WebSocket.OPEN) previous.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    later(() => previous.close(1000), 3_000);
    setPhase("connecting");
    setPartial("");
    const generation = rt.generation;
    connect(generation).catch((cause: unknown) => {
      if (generation === runtime.current.generation) end({ error: failureText(cause) });
    });
  }

  async function start() {
    if (phase === "connecting" || phase === "live") return;
    teardown();
    const rt = runtime.current;
    const generation = rt.generation;
    rt.last = null;
    setPhase("connecting");
    setError(null);
    setNotice(null);
    const context = new AudioContext();
    rt.context = context;
    const resumed = context.resume();
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined" || typeof WebSocket === "undefined") {
        throw new VoiceFailure(messages.unsupported);
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== rt.generation) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      rt.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new VoiceFailure(messages.missing);
      track.onended = () => end({ error: messages.lost });
      setDeviceLabel(track.label);
      await resumed;
      if (context.state === "suspended") throw new VoiceFailure(messages.unsupported);
      await context.audioWorklet.addModule("/voice/pcm-capture.js");
      if (generation !== rt.generation) return;
      const source = context.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(context, "pcm-capture", { channelCount: 1 });
      const sink = context.createGain();
      sink.gain.value = 0.00001;
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => sendAudio(event.data);
      source.connect(capture).connect(sink).connect(context.destination);
      navigator.permissions?.query({ name: "microphone" as PermissionName }).then((status) => {
        if (generation !== runtime.current.generation) return;
        runtime.current.permission = status;
        status.onchange = () => {
          if (status.state !== "granted") end({ error: messages.lost });
        };
      }).catch((cause: unknown) => {
        if (!(cause instanceof TypeError)) throw cause;
      });
      await connect(generation);
    } catch (cause) {
      if (generation === runtime.current.generation) end({ error: failureText(cause) });
    }
  }

  function toggleMute() {
    const rt = runtime.current;
    if (phase !== "live" || !rt.stream) return;
    const next = !rt.muted;
    rt.muted = next;
    for (const track of rt.stream.getAudioTracks()) track.enabled = !next;
    if (next && rt.socket?.readyState === WebSocket.OPEN) rt.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    setMuted(next);
    setPartial("");
    touch();
  }

  function setReview(next: boolean) {
    reviewRef.current = next;
    setReviewState(next);
  }

  function correct() {
    const text = takePending();
    if (text) optionsRef.current.onDraft(text);
  }

  const active = phase === "connecting" || phase === "live";

  useEffect(() => {
    if (!options.busy) flush();
  });

  useEffect(() => {
    if (phase !== "live") return;
    const opened = Date.now();
    const watch = setInterval(() => {
      const rt = runtime.current;
      setLevel(rt.level);
      if (rt.muted) return;
      if (rt.maxLevel > 0.02) setCapture("hearing");
      else if (Date.now() - opened > 2500) setCapture(rt.frames === 0 ? "blocked" : "silent");
    }, 400);
    return () => clearInterval(watch);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const interval = setInterval(() => {
      if (optionsRef.current.busy) runtime.current.lastActivity = Date.now();
      const elapsed = Date.now() - runtime.current.lastActivity;
      if (elapsed >= idleStopMs) end({ notice: messages.idle });
      else setIdleWarning(elapsed >= idleWarningMs);
    }, 1_000);
    return () => clearInterval(interval);
  });

  useEffect(() => {
    if (!active) return;
    function onHide() {
      const rt = runtime.current;
      if (document.visibilityState === "hidden" && rt.ready && !rt.muted) toggleMute();
    }
    function onLeave() {
      end({ discard: true });
    }
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
  });

  useEffect(() => () => teardown(), []);

  const status: VoiceStatus = phase === "inactive" || phase === "error" || phase === "connecting"
    ? phase
    : muted
      ? "muted"
      : partial
        ? "transcribing"
        : options.busy
          ? "processing"
          : "listening";

  return {
    status,
    active,
    muted,
    partial,
    held,
    level,
    capture,
    deviceLabel,
    idleWarning,
    error,
    notice,
    review,
    start,
    stop: (discard = false) => end({ discard }),
    dismiss: () => {
      setError(null);
      setNotice(null);
      if (phase === "error") setPhase("inactive");
    },
    toggleMute,
    setReview,
    correct,
    touch,
  };
}
