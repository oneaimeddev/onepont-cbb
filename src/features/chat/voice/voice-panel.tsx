import { useId } from "react";
import { Icon } from "../../../components/icon";
import type { VoiceStatus } from "./use-voice-session";

const labels: Record<VoiceStatus, string> = {
  inactive: "Voz desligada",
  connecting: "Conectando a voz…",
  reconnecting: "Reconectando a voz…",
  responding: "Respondendo",
  listening: "Ouvindo",
  transcribing: "Transcrevendo",
  processing: "Processando a resposta",
  muted: "Microfone silenciado",
  error: "Voz interrompida",
};

export function VoiceToggle({ active, status = "inactive", muted = false, disabled, onStart, onStop }: {
  active: boolean;
  status?: VoiceStatus;
  muted?: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const descriptionId = useId();
  const state = !active ? "inactive" : muted ? "muted" : status;
  const label = active ? "Encerrar conversa por voz" : "Iniciar conversa por voz";
  return (
    <button
      type="button"
      className="ia-icon ia-voice-toggle"
      data-status={state}
      aria-describedby={descriptionId}
      aria-pressed={active}
      aria-label={label}
      title={`${label} — ${labels[state]}`}
      disabled={disabled && !active}
      onClick={active ? onStop : onStart}
    >
      <Icon name={muted ? "micOff" : "mic"} size={18} />
      <span id={descriptionId} className="ia-sr">{labels[state]}</span>
    </button>
  );
}

export function VoicePanel({
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
  onMute,
  onStop,
  onRetry,
  onDismiss,
  onReview,
  onCorrect,
}: {
  status: VoiceStatus;
  active: boolean;
  muted: boolean;
  partial: string;
  held: string;
  level: number;
  capture: "pending" | "hearing" | "silent" | "blocked";
  deviceLabel: string;
  idleWarning: boolean;
  error: string | null;
  notice: string | null;
  review: boolean;
  onMute: () => void;
  onStop: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  onReview: (next: boolean) => void;
  onCorrect: () => void;
}) {
  if (!active) {
    const message = error ?? notice;
    if (!message) return null;
    return (
      <section className="ia-voice is-ended" aria-label="Conversa por voz">
        <p role={error ? "alert" : "status"}>{message}</p>
        <div className="ia-voice-actions">
          {error ? <button type="button" onClick={onRetry}>Tentar novamente</button> : null}
          <button type="button" onClick={onDismiss}>Fechar</button>
        </div>
      </section>
    );
  }
  return (
    <section className="ia-voice" aria-label="Conversa por voz" data-status={status}>
      <div className="ia-voice-bar">
        <p className="ia-voice-state" role="status" aria-live="polite">
          <span className="ia-voice-dot" aria-hidden="true" />
          <strong>{labels[status]}</strong>
          {status !== "connecting" ? <span className="ia-voice-mic">{muted ? "Microfone silenciado" : "Microfone ativo"}</span> : null}
          {deviceLabel ? <span className="ia-voice-device">{deviceLabel}</span> : null}
          {capture === "hearing" && !muted ? (
            <span className="ia-voice-level" aria-hidden="true"><span style={{ width: `${Math.round(Math.min(level, 1) * 100)}%` }} /></span>
          ) : null}
        </p>
        <div className="ia-voice-actions">
          <label className="ia-voice-review">
            <input type="checkbox" checked={review} onChange={(event) => onReview(event.target.checked)} />
            <span>Revisar antes de enviar</span>
          </label>
          <button type="button" onClick={onMute} disabled={status === "connecting"} aria-pressed={muted}>
            <Icon name={muted ? "mic" : "micOff"} size={16} />
            {muted ? "Retomar" : "Pausar"}
          </button>
          <button type="button" className="ia-voice-end" onClick={onStop}>
            <Icon name="stop" size={14} />
            Encerrar
          </button>
        </div>
      </div>
      {partial ? <p className="ia-voice-partial" aria-live="off">{partial}</p> : null}
      {held || partial ? (
        <div className="ia-voice-held">
          {held ? <p><span className="ia-sr">Transcrição a enviar </span>{held}</p> : null}
          <button type="button" onClick={onCorrect}>Corrigir</button>
        </div>
      ) : null}
      {capture === "silent" && !muted ? <p className="ia-voice-warning" role="status">Esse microfone não está captando som. No Windows, confira o dispositivo de entrada e se o volume dele não está em zero.</p> : null}
      {capture === "blocked" && !muted ? <p className="ia-voice-warning" role="status">O navegador não está enviando áudio. Confira a permissão de microfone ou continue por texto.</p> : null}
      {idleWarning ? <p className="ia-voice-warning" role="alert">Sem atividade. A voz será encerrada em instantes.</p> : null}
    </section>
  );
}
