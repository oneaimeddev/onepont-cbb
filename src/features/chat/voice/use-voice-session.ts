"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cleanSegment, commitDelay, joinSegments, messageLimit, pcmBase64, readLiveMessage, type LiveMessage } from "./transcription";

export type VoiceStatus = "inactive" | "connecting" | "reconnecting" | "responding" | "listening" | "transcribing" | "processing" | "muted" | "error";

type Phase = "inactive" | "connecting" | "reconnecting" | "live" | "error";

type Options = {
  busy: boolean;
  responding: boolean;
  editing: boolean;
  onTurn: (text: string) => void;
  onDraft: (text: string) => void;
};

type Runtime = {
  generation: number;
  stream: MediaStream | null;
  context: AudioContext | null;
  closingContext: Promise<void> | null;
  releaseCapture: (() => void) | null;
  socket: WebSocket | null;
  ready: boolean;
  capturing: boolean;
  pending: string[];
  muted: boolean;
  buffer: string;
  interim: string;
  awaitingFinal: boolean;
  reconnects: number;
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
const captureTimeoutMs = 20_000;
const renewAfterMs = 9.5 * 60_000;
const maxRenewals = 6;
const duplicateWindowMs = 4_000;
// Audio captured while the socket is still connecting is held and sent once the session is
// ready, so speech starts counting at the click instead of after the network handshake.
const maxPendingFrames = 150; // 15 s of 100 ms frames
const reconnectDelayMs = 500;
const finalTimeoutMs = 9_000;

const messages = {
  denied: "O acesso ao microfone foi negado. Libere o microfone no navegador para usar a voz.",
  captureTimeout: "O navegador demorou para liberar o microfone. Confira a permissão e tente novamente.",
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
  return messages.connect;
}

export function useVoiceSession(options: Options) {
  const optionsRef = useRef(options);
  const reviewRef = useRef(false);
  const runtime = useRef<Runtime>({
    generation: 0,
    stream: null,
    context: null,
    closingContext: null,
    releaseCapture: null,
    socket: null,
    ready: false,
    capturing: false,
    pending: [],
    muted: false,
    buffer: "",
    interim: "",
    awaitingFinal: false,
    reconnects: 0,
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
  const [capturing, setCapturing] = useState(false);

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
    if (optionsRef.current.busy || optionsRef.current.editing || rt.muted || !rt.ready || !rt.queue.length) return;
    const text = rt.queue.join(" ");
    rt.queue = [];
    if (text.length > messageLimit) optionsRef.current.onDraft(text);
    else optionsRef.current.onTurn(text);
  }

  function commit() {
    const rt = runtime.current;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = null;
    if (rt.awaitingFinal) return;
    const text = rt.buffer.trim();
    rt.buffer = "";
    setHeld("");
    if (!text) return;
    const now = Date.now();
    if (rt.last && rt.last.text === text && now - rt.last.at < duplicateWindowMs) return;
    rt.last = { text, at: now };
    if (reviewRef.current || optionsRef.current.editing || text.length > messageLimit) {
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

  function waitForFinal() {
    const rt = runtime.current;
    rt.awaitingFinal = true;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = setTimeout(() => {
      const pending = takePending();
      if (pending) optionsRef.current.onDraft(pending);
    }, finalTimeoutMs);
  }

  function takePending() {
    const rt = runtime.current;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = null;
    const text = [...rt.queue, rt.buffer.trim(), rt.interim].filter(Boolean).join(" ");
    rt.interim = "";
    rt.awaitingFinal = false;
    setPartial("");
    rt.buffer = "";
    rt.queue = [];
    setHeld("");
    return text;
  }

  function teardown() {
    const rt = runtime.current;
    rt.generation += 1;
    if (rt.commitTimer) clearTimeout(rt.commitTimer);
    rt.commitTimer = null;
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
    rt.releaseCapture?.();
    rt.releaseCapture = null;
    rt.capturing = false;
    rt.pending = [];
    for (const track of rt.stream?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    rt.stream = null;
    if (rt.context && rt.context.state !== "closed") {
      rt.closingContext = rt.context.close().catch(() => undefined);
    }
    rt.context = null;
    rt.muted = false;
    rt.renewals = 0;
    rt.reconnects = 0;
    rt.frames = 0;
    rt.level = 0;
    rt.maxLevel = 0;
    setMuted(false);
    setPartial("");
    setIdleWarning(false);
    setLevel(0);
    setCapture("pending");
    setDeviceLabel("");
    setCapturing(false);
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
    if (rt.muted) return;
    const data = pcmBase64(buffer);
    if (!rt.ready || !socket || socket.readyState !== WebSocket.OPEN) {
      rt.pending.push(data);
      if (rt.pending.length > maxPendingFrames) rt.pending.shift();
      return;
    }
    socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
  }

  function flushPending() {
    const rt = runtime.current;
    const socket = rt.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    for (const data of rt.pending) socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
    rt.pending = [];
  }

  function handle(message: LiveMessage, current: boolean) {
    const rt = runtime.current;
    if (!current) return;
    if (message.kind === "ready") {
      rt.ready = true;
      flushPending();
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
      waitForFinal();
      return;
    }
    if (message.kind === "interim") {
      touch();
      rt.interim = message.text.trim();
      setPartial(rt.interim);
      waitForFinal();
      return;
    }
    if (message.kind === "final") {
      touch();
      if (rt.commitTimer) clearTimeout(rt.commitTimer);
      rt.commitTimer = null;
      rt.awaitingFinal = false;
      rt.interim = "";
      setPartial("");
      if (rt.muted && optionsRef.current.editing) return;
      const segment = cleanSegment(message.text);
      if (segment) {
        rt.buffer = joinSegments(rt.buffer, segment);
        setHeld(rt.buffer);
      }
      if (rt.buffer) scheduleCommit(commitDelay(rt.buffer));
    }
  }

  function requestToken() {
    return fetch("/api/inteligencia/voz", { method: "POST", cache: "no-store" });
  }

  async function connect(generation: number, request = requestToken()) {
    const response = await request;
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
      if (!runtime.current.ready || runtime.current.reconnects >= 2) {
        end({ error: messages.dropped });
        return;
      }
      runtime.current.reconnects += 1;
      renew(reconnectDelayMs);
    };
  }

  function renew(delay = 0) {
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
    if (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING) previous.close(1000);
    const pending = takePending();
    if (pending) optionsRef.current.onDraft(pending);
    setPhase("reconnecting");
    const generation = rt.generation;
    later(() => {
      void connect(generation).catch((cause: unknown) => {
        if (generation === runtime.current.generation) end({ error: failureText(cause) });
      });
    }, delay);
  }

  async function start() {
    if (runtime.current.context) return;
    teardown();
    const rt = runtime.current;
    const generation = rt.generation;
    rt.last = null;
    setPhase("connecting");
    setError(null);
    setNotice(null);
    const captureTimer = later(() => end({ error: messages.captureTimeout }), captureTimeoutMs);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined" || typeof WebSocket === "undefined") {
        throw new VoiceFailure(messages.unsupported);
      }
      if (typeof AudioContext === "undefined") throw new VoiceFailure(messages.unsupported);
      // Token, audio module and microphone are requested together instead of one after another.
      const tokenRequest = requestToken();
      void tokenRequest.catch(() => undefined);
      const context = new AudioContext();
      rt.context = context;
      const resumed = context.resume();
      void resumed.catch(() => undefined);
      const moduleReady = context.audioWorklet.addModule("/voice/pcm-capture.js");
      void moduleReady.catch(() => undefined);
      if (rt.closingContext) await rt.closingContext;
      if (generation !== rt.generation) return;
      rt.closingContext = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== rt.generation) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      rt.stream = stream;
      if (document.visibilityState === "hidden") toggleMute();
      const track = stream.getAudioTracks()[0];
      if (!track) throw new VoiceFailure(messages.missing);
      track.onended = () => end({ error: messages.lost });
      setDeviceLabel(track.label);
      await resumed;
      if (generation !== rt.generation) return;
      if (context.state === "suspended") throw new VoiceFailure(messages.unsupported);
      await moduleReady;
      if (generation !== rt.generation) return;
      const source = context.createMediaStreamSource(stream);
      const capture = new AudioWorkletNode(context, "pcm-capture", { channelCount: 1 });
      const sink = context.createGain();
      sink.gain.value = 0.00001;
      capture.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (generation === rt.generation) sendAudio(event.data);
      };
      source.connect(capture).connect(sink).connect(context.destination);
      rt.releaseCapture = () => {
        capture.port.onmessage = null;
        capture.port.close();
        source.disconnect();
        capture.disconnect();
        sink.disconnect();
      };
      rt.capturing = true;
      setCapturing(true);
      navigator.permissions?.query({ name: "microphone" as PermissionName }).then((status) => {
        if (generation !== runtime.current.generation) return;
        runtime.current.permission = status;
        status.onchange = () => {
          if (status.state !== "granted") end({ error: messages.lost });
        };
      }).catch((cause: unknown) => {
        if (!(cause instanceof TypeError)) throw cause;
      });
      clearTimeout(captureTimer);
      rt.timers.delete(captureTimer);
      await connect(generation, tokenRequest);
    } catch (cause) {
      if (generation === runtime.current.generation) end({ error: failureText(cause) });
    }
  }

  function toggleMute() {
    const rt = runtime.current;
    if (!rt.stream) return;
    const next = !rt.muted;
    rt.muted = next;
    for (const track of rt.stream.getAudioTracks()) track.enabled = !next;
    if (next && rt.socket?.readyState === WebSocket.OPEN) rt.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    setMuted(next);
    touch();
  }

  function setReview(next: boolean) {
    reviewRef.current = next;
    setReviewState(next);
  }

  function correct() {
    const text = takePending();
    if (text) {
      if (!runtime.current.muted) toggleMute();
      optionsRef.current.onDraft(text);
    }
  }

  const active = phase === "connecting" || phase === "reconnecting" || phase === "live";

  useEffect(() => {
    if (!options.busy) flush();
  });

  useEffect(() => {
    if (!capturing) return;
    const opened = Date.now();
    const watch = setInterval(() => {
      const rt = runtime.current;
      setLevel(rt.level);
      if (rt.muted) return;
      if (rt.maxLevel > 0.02) setCapture("hearing");
      else if (Date.now() - opened > 2500) setCapture(rt.frames === 0 ? "blocked" : "silent");
    }, 400);
    return () => clearInterval(watch);
  }, [capturing]);

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
      if (document.visibilityState === "hidden" && !rt.muted) toggleMute();
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

  // Once the microphone is capturing, the first connection already counts as listening: the audio
  // is buffered and delivered as soon as the provider session is ready.
  const status: VoiceStatus = phase === "inactive" || phase === "error" || phase === "reconnecting" || (phase === "connecting" && !capturing)
    ? phase
    : muted
      ? "muted"
      : partial
        ? "transcribing"
        : options.busy
          ? options.responding ? "responding" : "processing"
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
